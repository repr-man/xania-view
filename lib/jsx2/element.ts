﻿import {
  AddEventListenerOperation,
  DomNavigationOperation,
  DomOperation,
  DomOperationType,
  DomRenderOperation,
  SetAttributeOperation,
  SetClassNameOperation,
  SetTextContentOperation,
} from '../compile/dom-operation';
import { JsxFactoryOptions } from '../jsx/options';
import { flatten } from './_flatten';
import { ExpressionType } from '../jsx/expression';
import { TemplateInput } from './template-input';
import { isRenderable, RenderTarget } from '../jsx/renderable';
import { isExpression } from '../jsx/expression';
import { Disposable, disposeAll } from '../disposable';
import { execute, ExecuteContext } from './execute';
import { State } from '../state';
import { isSubscribable } from '../util/is-subscibable';

export class JsxElement {
  public templateNode: HTMLElement;
  public content: DomContentOperation[] = [];
  public updates: DomUpdateOperation[] = [];

  constructor(public name: string) {
    this.templateNode = document.createElement(name);
  }

  setProp(
    attrName: string,
    attrValue: any,
    classes?: JsxFactoryOptions['classes']
  ): Promise<void> | void {
    if (attrValue === null || attrValue === undefined) return;

    if (attrValue instanceof Promise) {
      return attrValue.then((v) => this.setProp(attrName, v, classes));
    }

    const { templateNode: node } = this;

    if (('on' + attrName).toLocaleLowerCase() in HTMLElement.prototype) {
      if (attrValue instanceof Function) {
        this.content.push({
          type: DomOperationType.AddEventListener,
          name: attrName,
          handler: attrValue,
        });
      }
    } else if (attrName === 'class') {
      for (const item of flatten(attrValue)) {
        if (item instanceof Function) {
          this.content.push({
            type: DomOperationType.SetClassName,
            expression: {
              type: ExpressionType.Function,
              func: item,
              deps: [],
            },
            classes,
          });
        } else if (typeof item === 'string') {
          for (const cls of item.split(' ')) {
            if (cls) node.classList.add((classes && classes[cls]) || cls);
          }
        } else if (isSubscribable(item)) {
          this.content.push({
            type: DomOperationType.SetClassName,
            expression: {
              type: ExpressionType.State,
              state: item,
            },
            classes,
          });
        } else if (item instanceof State) {
          this.content.push({
            type: DomOperationType.SetClassName,
            expression: {
              type: ExpressionType.State,
              state: item,
            },
            classes,
          });
        } else if (isExpression(item)) {
          const op: DomUpdateOperation = {
            type: DomOperationType.SetClassName,
            expression: item,
            classes,
          };
          this.content.push(op);
          if (item.type === ExpressionType.Property) this.updates.push(op);
        }
      }
    } else if (attrValue instanceof State) {
      this.content.push({
        type: DomOperationType.SetAttribute,
        name: attrName,
        expression: {
          type: ExpressionType.State,
          state: attrValue,
        },
      });
    } else if (isExpression(attrValue)) {
      this.content.push({
        type: DomOperationType.SetAttribute,
        name: attrName,
        expression: attrValue,
      });
    } else {
      (node as any)[attrName] = attrValue;
    }
  }

  appendContent(children: TemplateInput[]): Promise<void>[] | void {
    if (!(children instanceof Array)) return;

    const result: Promise<void>[] = [];

    const { templateNode } = this;
    const createTextNodes =
      children.length > 0 || templateNode.childNodes.length > 0;

    const addTextContentExpr = (
      expr: JSX.Expression,
      operations: DomOperation[],
      createNode: boolean = true
    ) => {
      if (createTextNodes) {
        const textNodeIndex = templateNode.childNodes.length;
        if (createNode) {
          const textNode = document.createTextNode('');
          templateNode.appendChild(textNode);
        }
        operations.push({
          type: DomOperationType.SetTextContent,
          expression: expr,
          textNodeIndex: textNodeIndex,
        });
      } else {
        operations.push({
          type: DomOperationType.SetTextContent,
          expression: expr,
        });
      }
    };

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child instanceof JsxElement) {
        this.appendElement(child);
      } else if (child instanceof Promise) {
        const nextChildren = children.slice(i + 1);
        result.push(
          child.then((resolved: any) => {
            this.appendContent([resolved, ...nextChildren]);
          })
        );
      } else if (child instanceof State) {
        addTextContentExpr(
          {
            type: ExpressionType.State,
            state: child,
          },
          this.content
        );
      } else if (child instanceof Node) {
        templateNode.appendChild(child);
      } else if (child instanceof Function) {
        addTextContentExpr(
          {
            type: ExpressionType.Function,
            func: child,
            deps: [],
          },
          this.content
        );
      } else if (isRenderable(child)) {
        this.content.push({
          type: DomOperationType.Renderable,
          renderable: child,
        });
      } else if (isExpression(child)) {
        if (child.type === ExpressionType.Property) {
          addTextContentExpr(child, this.updates, false);
        }
        addTextContentExpr(child, this.content);
      } else if (isSubscribable(child)) {
        addTextContentExpr(
          {
            type: ExpressionType.Subscribable,
            subscribable: child,
          },
          this.content
        );
      } else {
        if (
          templateNode.textContent ||
          templateNode.childNodes.length ||
          this.content.length
        ) {
          const textNode = document.createTextNode(child as any);
          templateNode.appendChild(textNode);
        } else {
          templateNode.textContent = child as any;
        }
      }
    }

    return result;
  }

  appendElement(tag: JsxElement) {
    const { templateNode: node } = this;
    if (tag.content.length > 0) {
      this.content.push({
        type: DomOperationType.PushChild,
        index: node.childNodes.length,
      });
      for (const op of tag.content) {
        this.content.push(op);
      }
      this.content.push({
        type: DomOperationType.PopNode,
      });
    }
    if (tag.updates.length > 0) {
      this.updates.push({
        type: DomOperationType.PushChild,
        index: node.childNodes.length,
      });
      for (const op of tag.updates) {
        this.updates.push(op);
      }
      this.updates.push({
        type: DomOperationType.PopNode,
      });
    }

    this.templateNode.appendChild(tag.templateNode);
  }

  // listen(target: RenderTarget, root: HTMLElement, context: ExecuteContext) {
  //   if (this.events.length) {
  //     execute(this.events, root, context);
  //   }
  //   // target.addEventListener(eventName, function handler(event: Event) {
  //   //   let closest = event.target as HTMLElement | null;
  //   //   const { handlers } = context;
  //   //   while (closest) {
  //   //     for (const [node, handler] of handlers) {
  //   //       if (node === closest) {
  //   //         handler({ node: closest });
  //   //       }
  //   //     }
  //   //     if (target instanceof Node) {
  //   //       if (target === closest.parentElement) break;
  //   //     } else {
  //   //       for (const i in target.childNodes) {
  //   //         if (target.childNodes[i] === closest) break;
  //   //       }
  //   //     }
  //   //     closest = closest.parentElement;
  //   //   }
  //   // });
  // }

  render(target: RenderTarget) {
    const root = this.templateNode.cloneNode(true) as HTMLElement;
    const bindings: ExecuteContext['bindings'] = [];
    const subscriptions: ExecuteContext['subscriptions'] = [];

    execute(this.content, root, createExecuteContext(target, null));
    target.appendChild(root);

    return {
      dispose() {
        disposeAll(bindings);
        root.remove();
        for (const sub of subscriptions) {
          sub.unsubscribe();
        }
      },
    };
  }
}

type DomUpdateOperation =
  | DomNavigationOperation
  | SetTextContentOperation
  | SetClassNameOperation;

type DomContentOperation =
  | DomNavigationOperation
  | SetTextContentOperation
  | DomRenderOperation
  | DomNavigationOperation
  | SetAttributeOperation
  | SetClassNameOperation
  | AddEventListenerOperation;

export interface EventContext<TEvent> extends JSX.EventContext<TEvent> {
  node: Node;
  values: any;
  index: number;
  event: TEvent;
  view: JSX.ViewContext;
}

export function createExecuteContext<T>(target: RenderTarget, values?: T) {
  const bindings: Disposable[] = [];
  const subscriptions: JSX.Unsubscribable[] = [];

  return {
    bindings,
    subscriptions,
    data: new State(values),
    push: createEventHandler(target),
  } as ExecuteContext<T>;
}

export function createEventHandler(target: RenderTarget) {
  const events: {
    [k: string]: { context: ExecuteContext<any>; node: Node }[];
  } = {};

  return function pushHandler<T>(
    this: ExecuteContext<T>,
    node: Node,
    name: string,
    handler: (evnt: {
      node: Node;
      values: T | undefined;
      index: number;
      key: symbol;
      event: Event;
    }) => any
  ) {
    const context = this;
    if (name === 'blur') {
      node.addEventListener(name, function (event: Event) {
        const { value } = context.data;
        handler({
          node,
          values: value,
          event,
          key: context.key,
          index: context.index,
        });
      });
    } else if (name in events) {
      events[name].push({ context, node });
    } else {
      events[name] = [{ context, node }];
      target.addEventListener(name, function (event: Event) {
        let closest = event.target as HTMLElement | null;
        const nodes = events[event.type];
        while (closest) {
          for (const pair of nodes) {
            if (pair.node === closest) {
              handler({
                node: closest,
                values: pair.context.data.value,
                index: pair.context.index,
                key: pair.context.key,
                event,
              });
            }
          }
          if (target instanceof Node) {
            if (target === closest.parentElement) break;
          } else {
            for (const i in target.childNodes) {
              if (target.childNodes[i] === closest) break;
            }
          }
          closest = closest.parentElement;
        }
      });
    }
  };
}

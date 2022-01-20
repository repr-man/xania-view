import {
  AttributeType,
  TemplateType,
  Template,
  Renderable,
  RenderResult,
} from './template';
import { createDOMElement } from './render';
import { ExpressionType } from './expression';
import flatten from './util/flatten';
import {
  DomEventOperation,
  DomNavigationOperation,
  DomOperation,
  DomOperationType,
  DomRenderOperation,
} from './dom-operation';
import { createLookup } from './util/lookup';
import { isSubscribable } from './util/is-subscibable';

export interface RenderProps {
  items: ArrayLike<unknown>;
  start: number;
  count: number;
}

// interface RenderTarget {
//   appendChild(node: Node): void;
//   addEventListener(target: Element, name: string, handler: any): void;
// }

// interface AttrExpression {
//   name: string;
//   expression: Expression;
// }

type StackItem = [Node, Template | Template[]];

export function compile(rootTemplate: Template | Template[]) {
  const operationsMap = createLookup<Node, DomOperation>();

  const fragment = new DocumentFragment();
  const stack: StackItem[] = [];
  if (Array.isArray(rootTemplate)) {
    for (const tpl of rootTemplate) {
      const frg = new DocumentFragment();
      fragment.appendChild(frg);
      stack.push([frg, tpl]);
    }
  } else {
    stack.push([fragment, rootTemplate]);
  }
  while (stack.length > 0) {
    const curr = stack.pop() as StackItem;
    const [target, template] = curr;

    if (Array.isArray(template)) {
      for (let i = template.length; i--; ) stack.push([target, template[i]]);
      continue;
    }

    switch (template.type) {
      case TemplateType.Tag:
        const { name, attrs, children } = template;
        const dom = createDOMElement('http://www.w3.org/1999/xhtml', name);
        target.appendChild(dom);

        if (attrs) {
          for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.type === AttributeType.Attribute) {
              setAttribute(dom, attr.name, attr.value);
            } else if (attr.type === AttributeType.Event) {
              operationsMap.add(dom, {
                type: DomOperationType.AddEventListener,
                name: attr.event,
                handler: attr.handler,
              });
            }
          }
        }

        let { length } = children;
        while (length--) {
          stack.push([dom, children[length]]);
        }
        break;
      case TemplateType.Text:
        const textNode = document.createTextNode(template.value);
        target.appendChild(textNode);
        break;
      case TemplateType.Renderable:
        operationsMap.add(target, {
          type: DomOperationType.Renderable,
          renderable: template.renderer,
        });
        break;
      case TemplateType.Subscribable:
        const asyncNode = document.createTextNode('');
        target.appendChild(asyncNode);
        operationsMap.add(asyncNode, {
          type: DomOperationType.Renderable,
          renderable: {
            render({ target }) {
              const subscr = template.value.subscribe({
                next(x) {
                  target.textContent = x;
                },
              });
              return RenderResult.create(null, subscr);
            },
          },
        });
        break;
      case TemplateType.Context:
        const contextNode = document.createTextNode('');
        target.appendChild(contextNode);
        operationsMap.add(target, {
          type: DomOperationType.Renderable,
          renderable: createFunctionRenderer(template.func),
        });
        break;
      case TemplateType.Expression:
        const exprNode = document.createTextNode('');
        target.appendChild(exprNode);

        operationsMap.add(exprNode, {
          type: DomOperationType.SetTextContent,
          expression: template.expression,
        });

        break;
    }
  }

  return createResult();

  function compileOperations(
    rootNodes: ChildNode[],
    operationsMap: {
      get(node: Node): DomOperation[] | undefined;
    }
  ) {
    const flattened = flatten(
      rootNodes.map(createNodeCustomization),
      ({ templateNode }) =>
        toArray(templateNode.childNodes).map(createNodeCustomization)
    );

    const customizations = new Map<Node, NodeCustomization>();
    // iterate in reverse to traverse nodes bottom up
    for (let i = flattened.length - 1; i >= 0; i--) {
      const cust = flattened[i];

      const children = toArray(cust.templateNode.childNodes)
        .map((node) => customizations.get(node))
        .filter((x) => !!x) as NodeCustomization[];

      customizations.set(cust.templateNode, cust);

      iter(cust, (x) => x.render);
      const eventNames = distinct(
        selectMany(children, (child) => Object.keys(child.events))
      );
      for (const eventName of eventNames) {
        if (!cust.events[eventName]) {
          cust.events[eventName] = [];
        }
        iter(cust, (x) => x.events[eventName]);
      }
      const placeholderNames = distinct(
        selectMany(children, (child) => Object.keys(child.updates))
      );
      for (const name of placeholderNames) {
        if (!cust.updates[name]) {
          cust.updates[name] = [];
        }
        iter(cust, (x) => x.updates[name]);
      }

      function iter(
        cust: NodeCustomization,
        getOperations: (
          node: NodeCustomization
        ) => (DomOperation | DomNavigationOperation)[]
      ) {
        const operations = getOperations(cust);
        if (children.length || operations.length) {
          if (
            children.length === 1 &&
            children[0].templateNode.nodeType === Node.TEXT_NODE
          ) {
            const childOperations = getOperations(children[0]);
            if (
              childOperations &&
              childOperations.length === 1 &&
              childOperations[0].type === DomOperationType.SetTextContent
            ) {
              const child = children[0];
              child.templateNode.remove();
              operations.push(childOperations[0]);
              return;
            }
          }

          let prevIndex = -1;

          for (const child of children) {
            const childOperations = getOperations(child);
            if (childOperations?.length) {
              const { index } = child;
              if (index === 0) {
                operations.push({
                  type: DomOperationType.PushFirstChild,
                });
              } else if (index === prevIndex + 1) {
                operations.pop();
                operations.push({
                  type: DomOperationType.PushNextSibling,
                });
              } else {
                operations.push({
                  type: DomOperationType.PushChild,
                  index,
                });
              }
              operations.push(...childOperations);
              operations.push({ type: DomOperationType.PopNode });
              prevIndex = index;
            }
          }
        }
      }
    }

    return customizations;

    function createNodeCustomization(
      node: ChildNode,
      index: number
    ): NodeCustomization {
      const operations = operationsMap.get(node) || [];
      const render: DomRenderOperation[] = [];
      const events: { [event: string]: DomEventOperation[] } = {};
      const updates: { [event: string]: DomRenderOperation[] } = {};

      for (const op of operations) {
        switch (op.type) {
          case DomOperationType.SetAttribute:
          case DomOperationType.SetTextContent:
            if (op.expression.type === ExpressionType.Property) {
              const name = op.expression.name;
              const updatesBag = updates[name] || (updates[name] = []);
              updatesBag.push(op);
            }
            render.push(op);
            break;
          case DomOperationType.Renderable:
            render.push(op);
            break;
          case DomOperationType.AddEventListener:
            const { name } = op;
            const eventBag = events[name] || (events[name] = []);
            eventBag.push(op);
            break;
        }
      }
      return {
        templateNode: node,
        index,
        render,
        events,
        updates,
        nodes: [],
      };
    }
  }

  function createResult() {
    const rootNodes = toArray(fragment.childNodes as NodeListOf<HTMLElement>);

    const renderCustomizations = compileOperations(rootNodes, operationsMap);
    const cust = renderCustomizations.get(rootNodes[0]);

    return new CompileResult(cust);
  }

  function createFunctionRenderer(func: Function): Renderable {
    return {
      render({ target }: { target: Node }, context: any) {
        const value = func(context);
        if (isSubscribable(value)) {
          const subscr = value.subscribe({
            next(x: any) {
              target.textContent = x;
            },
          });
          return RenderResult.create(null, subscr);
        } else {
          target.textContent = value;
          return;
        }
      },
    };
  }

  function setAttribute(elt: Element, name: string, value: any): void {
    if (!value) return;

    if (value.type === TemplateType.Expression) {
      operationsMap.add(elt, {
        type: DomOperationType.SetAttribute,
        name,
        expression: value.expression,
      });
    } else if (isSubscribable(value)) {
      operationsMap.add(elt, {
        type: DomOperationType.Renderable,
        renderable: {
          render(ctx) {
            bind(ctx.target, value);
          },
        },
      });
    } else if (typeof value === 'function') {
      const func = value;
      operationsMap.add(elt, {
        type: DomOperationType.Renderable,
        renderable: {
          render(ctx, args) {
            const value = func(args);

            if (isSubscribable(value)) {
              bind(ctx.target, value);
            } else {
              ctx.target.setAttribute(name, value);
            }
          },
        },
      });
    } else {
      elt.setAttribute(name, value);
    }

    function bind(target: Element, subscribable: RXJS.Subscribable<any>) {
      const subscr = subscribable.subscribe({
        next(value: any) {
          target.setAttribute(name, value);
        },
      });

      return {
        dispose() {
          subscr.unsubscribe();
        },
      };
    }
  }
}

export interface RenderOptions {
  items: ArrayLike<any>;
  start: number;
  count: number;
}

export class CompileResult {
  constructor(public customization?: NodeCustomization) {}

  listen(rootContainer: Element) {
    const { customization } = this;
    if (!customization) return;

    function getRootNode(node: Node | null): Node | null {
      if (!node) return null;
      if (node.parentNode === rootContainer) return node;
      return getRootNode(node.parentNode);
    }

    for (const eventName of distinct(Object.keys(customization.events))) {
      rootContainer.addEventListener(eventName, (evt: Event) => {
        const eventName = evt.type;
        const eventTarget = evt.target as Node;

        if (!eventTarget) return;

        const operations = customization.events[eventName];
        if (!operations || !operations.length) return;

        const rootNode = getRootNode(eventTarget as Node) as HTMLElement;
        const renderStack: Node[] = [rootNode];
        let renderIndex = 0;
        for (let n = 0, len = operations.length | 0; n < len; n = (n + 1) | 0) {
          const operation = operations[n];
          const curr = renderStack[renderIndex];
          switch (operation.type) {
            case DomOperationType.PushChild:
              renderStack[++renderIndex] = curr.childNodes[
                operation.index
              ] as HTMLElement;
              break;
            case DomOperationType.PushFirstChild:
              renderStack[++renderIndex] = curr.firstChild as HTMLElement;
              break;
            case DomOperationType.PushNextSibling:
              renderStack[++renderIndex] = curr.nextSibling as HTMLElement;
              break;
            case DomOperationType.PopNode:
              renderIndex--;
              break;
            case DomOperationType.AddEventListener:
              if (eventTarget === curr || curr.contains(eventTarget)) {
                operation.handler({ node: rootNode });
              }
              break;
          }
        }
      });
    }
  }
}

const renderStack: Node[] = [];
export function execute(
  operations: DomOperation[],
  rootNodes: Node[],
  items: ArrayLike<any>,
  offset: number,
  length: number
) {
  for (let n = 0, len = length; n < len; n = (n + 1) | 0) {
    const values = items[n];
    renderStack[0] = rootNodes[n + offset];
    let renderIndex = 0;
    for (let n = 0, len = operations.length | 0; n < len; n = (n + 1) | 0) {
      const operation = operations[n];
      const curr = renderStack[renderIndex];
      switch (operation.type) {
        case DomOperationType.PushChild:
          renderStack[++renderIndex] = curr.childNodes[
            operation.index
          ] as HTMLElement;
          break;
        case DomOperationType.PushFirstChild:
          renderStack[++renderIndex] = curr.firstChild as HTMLElement;
          break;
        case DomOperationType.PushNextSibling:
          renderStack[++renderIndex] = curr.nextSibling as HTMLElement;
          break;
        case DomOperationType.PopNode:
          renderIndex--;
          break;
        case DomOperationType.SetTextContent:
          const textContentExpr = operation.expression;
          switch (textContentExpr.type) {
            case ExpressionType.Property:
              curr.textContent = values[textContentExpr.name];
              break;
          }
          break;
        case DomOperationType.SetAttribute:
          const attrExpr = operation.expression;
          switch (attrExpr.type) {
            case ExpressionType.Property:
              (curr as any)[operation.name] = values[attrExpr.name];
              break;
          }
          break;
      }
    }
  }
}

type NodeCustomization = {
  index: number;
  templateNode: ChildNode;
  render: (DomNavigationOperation | DomRenderOperation)[];
  events: { [event: string]: (DomNavigationOperation | DomEventOperation)[] };
  updates: { [event: string]: (DomNavigationOperation | DomRenderOperation)[] };
  nodes: Node[];
};

function toArray<T extends Node>(nodes: NodeListOf<T>) {
  const result: T[] = [];
  const length = nodes.length;
  for (let i = 0; i < length; i++) {
    result.push(nodes[i]);
  }
  return result;
}

function selectMany<T, P>(
  source: (T | undefined)[],
  selector: (x: T) => (P | undefined)[]
): P[] {
  const result: P[] = [];

  for (const x of source) {
    if (x) {
      const members = selector(x);
      for (const m of members) {
        if (m) result.push(m);
      }
    }
  }

  return result;
}

function distinct<T>(source: T[]) {
  return new Set<T>(source);
}

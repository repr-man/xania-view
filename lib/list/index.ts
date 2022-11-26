﻿import { createEventHandler, JsxElement } from '../jsx2/element';
import { RenderTarget } from '../jsx';
import { execute, ExecuteContext } from '../jsx2/execute';
// import { State } from '../state';
import { ListMutationType, ListSource } from './list-source';
import { State } from '../state';

export interface ListProps<T> {
  source: T[] | ListSource<T>;
}

export function List<T>(props: ListProps<T>, children: JsxElement[]) {
  return {
    render(target: RenderTarget) {
      const sharedEventHandler = createEventHandler(target);
      const source = props.source;
      let virtualItems: VirtualItem[] = [];

      if (source instanceof Array) {
        renderChildren(source.map((e) => new State<T>(e)));
      } else if (source instanceof ListSource) {
        source.subscribe({
          next(mut) {
            switch (mut.type) {
              case ListMutationType.Append:
                appendChild(mut.item);
                break;
              case ListMutationType.DeleteAt:
                deleteChild(mut.index);
                break;
            }
          },
        });
        renderChildren(source.properties);
      }

      function deleteChild(index: number) {
        const virtualItem = virtualItems[index];

        for (const binding of virtualItem.bindings) {
          binding.dispose();
        }
        for (const subscription of virtualItem.subscriptions) {
          subscription.unsubscribe();
        }

        for (const elt of virtualItem.elements) {
          elt.remove();
        }

        virtualItems.splice(index, 1);
      }

      function appendChild(item: State<T>) {
        var executeContext: VirtualItem = {
          bindings: [],
          subscriptions: [],
          data: item,
          elements: [],
          key: Symbol(),
          push: sharedEventHandler,
        };

        virtualItems.push(executeContext);

        for (const child of children) {
          if (child instanceof JsxElement) {
            const root = child.templateNode.cloneNode(true) as HTMLElement;
            executeContext.elements.push(root);
            execute(child.content, root, executeContext);
            target.appendChild(root);
          }
        }
      }

      function renderChildren(source: State<T>[]) {
        let v = 0,
          s = 0;
        const newItems: typeof virtualItems = new Array(source.length);
        while (v < virtualItems.length) {
          const virtualItem = virtualItems[v++];
          if (virtualItem.data === source[s]) {
            newItems[s++] = virtualItem;

            // let index = 0;
            // for (const child of children) {
            //   if (child instanceof JsxElement) {
            //     execute(
            //       child.updates,
            //       virtualItem.elements[index++],
            //       virtualItem
            //     );
            //   }
            // }
          } else {
            for (const binding of virtualItem.bindings) {
              binding.dispose();
            }
            for (const subscription of virtualItem.subscriptions) {
              subscription.unsubscribe();
            }

            for (const elt of virtualItem.elements) {
              elt.remove();
            }
          }
        }
        virtualItems = newItems;

        for (let i = s, length = source.length; i < length; i++) {
          const data = source[i];
          var executeContext: VirtualItem = {
            bindings: [],
            subscriptions: [],
            data,
            elements: [],
            key: Symbol(),
            push: sharedEventHandler,
          };

          virtualItems[i] = executeContext;

          for (const child of children) {
            if (child instanceof JsxElement) {
              const root = child.templateNode.cloneNode(true) as HTMLElement;
              executeContext.elements.push(root);
              execute(child.content, root, executeContext);
              target.appendChild(root);
            }
          }

          data.subscribe({
            executeContext,
            next() {
              const virtualItem = this.executeContext;

              let i = 0;
              for (const child of children) {
                if (child instanceof JsxElement) {
                  const root = virtualItem.elements[i++];
                  execute(child.updates, root, virtualItem);
                }
              }
            },
          });
        }

        virtualItems.length = source.length;
      }
    },
  };
}

interface VirtualItem extends ExecuteContext {
  elements: HTMLElement[];
}

﻿import { JsxElement } from '../../jsx/element';
import { execute } from '../../render/execute';
import { ListSource } from './list-source';
import { ListMutationType } from './mutation';
import { disposeContext, ExecuteContext } from '../../render/execute-context';
import { listen } from '../../render/listen';
import { Anchor, RenderTarget } from '../../jsx';
import { update } from '../../render/update';
import { compile } from '../../render/compile';

export interface ListProps<T> {
  source: T[] | ListSource<T>;
}

export * from './list-source';
export * from './mutation';

export function List<T extends ExecuteContext>(
  props: ListProps<T>,
  _children: JsxElement[]
) {
  if (_children.length > 1)
    throw new Error('move than 1 child is not supported');

  return {
    async render(target: RenderTarget) {
      const source = props.source;

      const { updateOperations, renderOperations, events } = await compile(
        _children,
        target
      );

      for (const [evt, rootIdx] of events) listen(target, evt, rootIdx);

      if (source instanceof Array) {
        renderChildren(source);
      } else if (source instanceof ListSource) {
        source.subscribe({
          next(mut) {
            switch (mut.type) {
              // case ListMutationType.Push:
              //   renderChild(mut.item);
              //   break;
              // case ListMutationType.Insert:
              //   renderChild(mut.item, mut.index);
              //   break;
              case ListMutationType.Delete:
                disposeContext(mut.item);
                break;
              case ListMutationType.Clear:
                clear(mut.firstItem, mut.lastItem);
                break;
              case ListMutationType.Move:
                moveChild(mut.item, mut.beforeItem);
                break;
              case ListMutationType.Update:
                update(updateOperations, mut.items);
                break;
              case ListMutationType.Concat:
                renderChildren(mut.items);
                break;
            }
          },
        });
        renderChildren(source.snapshot);
      }

      function clear(from: ExecuteContext, to: ExecuteContext) {
        const firstElement = from.rootElement as Node;
        const lastElement = findLastElement(to) as Node;

        if (
          !(target instanceof Anchor) &&
          firstElement === target.firstChild &&
          lastElement.nextSibling === null
        ) {
          target.textContent = '';
          return;
        }

        const rangeObj = new Range();
        rangeObj.setStartBefore(firstElement);
        rangeObj.setEndAfter(lastElement);

        rangeObj.deleteContents();
      }

      function moveChild(from: ExecuteContext, to: ExecuteContext) {
        if (from === to) return;

        const referenceNode = to.rootElement ?? null;

        if (from.rootElement)
          target.insertBefore(from.rootElement, referenceNode);
        if (from.moreRootElements)
          for (const elt of from.moreRootElements) {
            target.insertBefore(elt, referenceNode);
          }
      }

      function renderChildren(source: ArrayLike<ExecuteContext>) {
        execute(renderOperations, source);
      }
    },
  };
}

function findLastElement(xc: ExecuteContext) {
  const { moreRootElements } = xc;
  if (moreRootElements?.length) {
    const last = moreRootElements[moreRootElements.length - 1];
    return last;
  } else {
    return xc.rootElement ?? null;
  }
}

﻿import { notify } from '../rx';
import { ExpressionType } from './expression';
import { Template, TemplateType } from './template';

export class Context<T> {
  lazy<U>(value: U) {
    return new Lazy<T, U>(value);
  }

  readonly(name: keyof T) {
    return this.get(name, true);
  }

  get(name: keyof T, readonly: boolean = false) {
    return expr({
      type: ExpressionType.Property,
      name,
      readonly,
    });
  }
}

export class Lazy<T, U> {
  constructor(public value: U) {}

  attachables: [HTMLElement, Function][] = [];

  select(context: T) {
    notify(this, [context, this.value]);
    return () => {
      notify(this, [context, null]);
    };
  }

  attach(func: (x: JSX.ViewContext<T>) => void) {
    const { attachables } = this;
    return {
      attachTo(x: HTMLElement) {
        attachables.push([x, func]);
      },
    };
  }
}

function expr(expr: JSX.Expression): Template {
  return {
    type: TemplateType.Expression,
    expr,
  };
}

export function useContext<T>() {
  return new Context<T>();
}

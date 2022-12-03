interface SVGTagNameMap {
  svg: {
    xmlns: string;
    width: number;
    height: number;
    fill: string;
    viewBox: string;
    stroke: string;
  };
  g: {
    fill: string;
    'fill-rule': string;
  };
  path: {
    d: string;
    fill: string;
    'fill-rule': string;
  };
}

declare module JSX {
  type TagNameMap = HTMLElementTagNameMap &
    SVGTagNameMap & {
      div: {
        role: string;
      };
      a: {
        role: string;
      };
    };

  type IntrinsicElements = {
    [P in keyof TagNameMap]: IntrinsicElement<P>;
  } & {
    label: {
      for?: string | number;
    };
    style: any;
  };

  type Element = any;

  type EventMap<T> = {
    [P in keyof HTMLElementEventMap]?: (
      e: EventContext<T, HTMLElementEventMap[P]>
    ) => void;
  };

  type ClassNamePrimitive = string | string[];
  type ClassName =
    | ClassName[]
    | Function
    | ClassNamePrimitive
    | State<ClassNamePrimitive>
    | Promise<ClassNamePrimitive>
    | Template
    | Expression<
        | ClassNamePrimitive
        | Promise<ClassNamePrimitive>
        | State<ClassNamePrimitive>
      >;

  type ContextFunction<T, U = any> = (
    t: T,
    context?: { index: number; node: Node }
  ) => U | null | State<U> | Promise<U>;

  type IntrinsicElement<P extends keyof TagNameMap> = EventMap<any> & {
    [K in Attributes<TagNameMap[P], string>]?: AttrValue<any>;
  } & {
    [K in Attributes<TagNameMap[P], number>]?: AttrValue<number>;
  } & {
    [K in Attributes<TagNameMap[P], boolean>]?: AttrValue<boolean>;
  } & {
    class?: ClassName;
    style?: any;
    role?: string;
  };

  type AttrValue<T> = T | null | Template | Expression<any, T>;

  type Attributes<T, U> = {
    [P in keyof T]: T[P] extends U ? P : never;
  }[keyof T];

  interface ExpressionTemplate<T, U> {
    type: number;
    expression: Expression<T, U>;
  }

  interface EventContext<T, TEvent> extends ViewContext<T> {
    event: TEvent;
  }

  export enum ExpressionType {
    Init = 0,
    Property = 1,
    Function = 2,
    State = 3,
    Subscribable = 4,
  }

  export interface ViewContext<T> {
    readonly node: any;
    readonly data: T;
  }

  export interface InitExpression<T> {
    type: ExpressionType.Init;
    init: (t: State<T>, context: ViewContext<T>) => JSX.Expression | null;
  }

  export interface PropertyExpression {
    type: ExpressionType.Property;
    name: string | number | symbol;
  }

  export interface FunctionExpression<T, U = string> {
    type: ExpressionType.Function;
    func: ContextFunction<T, U>;
    deps: (string | number | symbol)[];
  }

  export interface StateExpression<U> {
    type: ExpressionType.State;
    state: Subscribable<U>;
  }

  export interface SubscribableExpression<U> {
    type: ExpressionType.Subscribable;
    subscribable: Subscribable<U>;
  }

  export type Template = {};

  export type Expression<T = any, U = any> =
    | InitExpression<T>
    | PropertyExpression
    | FunctionExpression<T, U>
    | StateExpression<U>
    | SubscribableExpression<U>;

  export interface Unsubscribable {
    unsubscribe(): void;
  }

  export interface Value<T> {
    subscribe<O extends NextObserver<T>>(observer: O): Unsubscribable;
    map<U>(func: (t?: T) => U): Value<U>;
    get<K extends keyof T>(name: K): State<T[K]>;
  }

  export interface State<T> {
    subscribe<O extends NextObserver<T>>(observer: O): Unsubscribable;
    map<U>(func: (t?: T) => U): Value<U>;
    get<K extends keyof T>(name: K): State<T[K]>;
    update(value: T | Updater<T>): void;
  }

  type Updater<T> = (t: T) => void | T;

  export interface Subscribable<T> {
    subscribe<O extends NextObserver<T>>(observer: O): Unsubscribable;
  }

  export interface NextObserver<T> {
    next: (value: T) => void;
    error?: (err: any) => void;
    complete?: () => void;
  }
}

type Func<T> = () => T;
type NestedArray<T> = T | [NestedArray<T>];

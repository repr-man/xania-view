import { Expression } from '../expression';
import { Renderable } from '../renderable';

export enum DomOperationType {
  PushFirstChild,
  PushNextSibling,
  PushChild,
  PopNode,
  SetAttribute,
  SetClassName,
  SetTextContent,
  Renderable,
  AddEventListener,
  AppendChild,
  CloneNode,
}

export interface PushFirstChildOperation {
  type: DomOperationType.PushFirstChild;
}
export interface PushNextSiblingOperation {
  type: DomOperationType.PushNextSibling;
}
export interface PushChildOperation {
  type: DomOperationType.PushChild;
  index: number;
}
export interface PopNodeOperation {
  type: DomOperationType.PopNode;
}
export interface SetAttributeOperation {
  type: DomOperationType.SetAttribute;
  name: string;
  expression: Expression;
}

export interface SetClassNameOperation {
  type: DomOperationType.SetClassName;
  expression: Expression;
}
export interface SetTextContentOperation {
  type: DomOperationType.SetTextContent;
  expression: Expression;
}

export interface RenderableOperation {
  type: DomOperationType.Renderable;
  renderable: Renderable;
}

export interface AddEventListenerOperation {
  type: DomOperationType.AddEventListener;
  name: string;
  handler: Function;
}

export interface AppendChildOperation {
  type: DomOperationType.AppendChild;
  node: Node;
}

export interface CloneNodeOperation {
  type: DomOperationType.CloneNode;
  template: Node;
}

export type DomNavigationOperation =
  | PushFirstChildOperation
  | PushNextSiblingOperation
  | PushChildOperation
  | PopNodeOperation;

export type DomRenderOperation =
  | CloneNodeOperation
  | SetAttributeOperation
  | SetClassNameOperation
  | SetTextContentOperation
  | RenderableOperation
  | AppendChildOperation;

export type DomEventOperation = AddEventListenerOperation;

export type DomOperation =
  | DomNavigationOperation
  | DomEventOperation
  | DomRenderOperation;

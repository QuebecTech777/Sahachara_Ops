import * as React from 'react';

export function isFragment(object: unknown): boolean {
  if (!object || typeof object !== 'object') {
    return false;
  }
  const type = (object as { type?: unknown }).type;
  return type === React.Fragment || type === Symbol.for('react.fragment');
}

export default {
  isFragment
};


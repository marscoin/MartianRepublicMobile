import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { withDefaultProps } from '../../blue_modules/react-default-props';

// React 19 dropped defaultProps for function components. Libraries the app uses
// (react-native-elements 3 among them) still depend on them for sizes and colours.
describe('defaultProps on function components', () => {
  it('fills in missing and undefined props, and keeps the ones that were given', () => {
    const Label = () => null;
    Label.defaultProps = { size: 24, color: 'black' };
    expect(withDefaultProps(Label, { color: 'white', size: undefined })).toEqual({ color: 'white', size: 24 });
    expect(withDefaultProps(Label, null)).toEqual({ size: 24, color: 'black' });
  });

  it('does not copy props when there is nothing to add', () => {
    const Plain = () => null;
    const props = { a: 1 };
    expect(withDefaultProps(Plain, props)).toBe(props);
    expect(withDefaultProps('View', props)).toBe(props);
  });

  it('leaves class components to React', () => {
    class Legacy extends React.Component {
      static defaultProps = { size: 24 };
      render() {
        return null;
      }
    }
    const props = {};
    expect(withDefaultProps(Legacy, props)).toBe(props);
  });

  it('reaches a rendered function component', () => {
    const seen = [];
    const Label = props => {
      seen.push(props);
      return null;
    };
    Label.defaultProps = { size: 24 };
    act(() => {
      TestRenderer.create(React.createElement(Label, { name: 'home' }));
    });
    expect(seen[0]).toEqual({ name: 'home', size: 24 });
    act(() => {
      TestRenderer.create(<Label name="star" />);
    });
    expect(seen[seen.length - 1]).toEqual({ name: 'star', size: 24 });
  });
});

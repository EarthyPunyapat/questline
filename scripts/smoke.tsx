import React from 'react';
import { render, Text } from 'ink';

function Smoke(): React.ReactElement {
  return <Text color="green">questline boot OK</Text>;
}

const app = render(<Smoke />);
setTimeout(() => app.unmount(), 100);

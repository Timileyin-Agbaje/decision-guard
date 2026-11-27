import React, { useState } from 'react';
import ForgeReconciler, { Textfield, Button, Text, Stack } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');

  const save = async () => {
    const result = await invoke('saveTestValue', { value });
    setStatus(result);
  };

  return (
    <Stack space="space.100">
      <Textfield name="value" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button onClick={save}>Save</Button>
      <Text>{status}</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

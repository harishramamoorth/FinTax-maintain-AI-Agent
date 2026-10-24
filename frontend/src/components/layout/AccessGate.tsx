import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { Button, Field, Input } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';

/** Prompts for the server's optional shared ACCESS_TOKEN when the API answers 401. Stored in sessionStorage only. */
export function AccessGate() {
  const needed = useUiStore((s) => s.accessNeeded); const set = useUiStore((s) => s.setAccessNeeded);
  const setToken = useAuthStore((s) => s.setToken); const [v, setV] = useState(''); const qc = useQueryClient();
  const submit = () => { setToken(v.trim()); set(false); setV(''); void qc.invalidateQueries(); };
  return (
    <Modal open={needed} onClose={() => set(false)} title="Access token required" width="max-w-md"
      footer={<Button variant="primary" disabled={!v.trim()} onClick={submit}>Unlock</Button>}>
      <p className="text-sm text-muted mb-3">This server is protected by an access token (ACCESS_TOKEN). Enter it to continue. It is kept in this browser tab only and is never stored on disk.</p>
      <Field label="Access token" htmlFor="tok"><Input id="tok" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && submit()} /></Field>
    </Modal>
  );
}

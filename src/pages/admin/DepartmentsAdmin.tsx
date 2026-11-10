import { useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import { useRefData } from '../../lib/refdata';
import type { Department } from '../../lib/types';
import { ErrorBox, Field, useToast } from '../../components/ui';

export default function DepartmentsAdmin() {
  const ref = useRefData();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  async function add() {
    setError(null);
    const { error } = await supabase.from('departments').insert({ code: code.trim().toUpperCase(), name: name.trim() });
    if (error) setError(/departments_code_check/.test(error.message) ? 'Code must be 2–20 capital letters, digits, - or _.' : errorMessage(error));
    else { setCode(''); setName(''); toast('Department added'); await ref.reload(); }
  }
  async function update(d: Department, patch: Partial<Department>) {
    setError(null);
    const { error } = await supabase.from('departments').update(patch).eq('id', d.id);
    if (error) setError(errorMessage(error)); else { toast('Department updated'); setEdit(e => { const n = { ...e }; delete n[d.id]; return n; }); await ref.reload(); }
  }

  return (
    <div className="page">
      <header className="page-head"><div><h1>Departments</h1><p className="muted">Departments cannot be deleted once used; deactivate them instead.</p></div></header>
      <ErrorBox error={error} />
      <section className="card">
        <h3>Add department</h3>
        <div className="row wrap align-end">
          <Field label="Code" hint="e.g. HEM, CHEM, BB"><input value={code} onChange={e => setCode(e.target.value)} maxLength={20} /></Field>
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
          <button className="btn btn-primary" onClick={add} disabled={!code.trim() || !name.trim()}>Add</button>
        </div>
      </section>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Status</th><th /></tr></thead>
          <tbody>
            {ref.departments.map(d => (
              <tr key={d.id} className={d.active ? '' : 'row-muted'}>
                <td className="mono">{d.code}</td>
                <td>{d.id in edit
                  ? <div className="row"><input value={edit[d.id]} onChange={e => setEdit({ ...edit, [d.id]: e.target.value })} />
                      <button className="btn btn-sm btn-primary" onClick={() => update(d, { name: edit[d.id].trim() })} disabled={!edit[d.id].trim()}>Save</button></div>
                  : d.name}</td>
                <td>{d.active ? 'Active' : 'Inactive'}</td>
                <td className="nowrap">
                  {!(d.id in edit) && <button className="btn btn-sm" onClick={() => setEdit({ ...edit, [d.id]: d.name })}>Rename</button>}{' '}
                  <button className="btn btn-sm btn-ghost" onClick={() => update(d, { active: !d.active })}>{d.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

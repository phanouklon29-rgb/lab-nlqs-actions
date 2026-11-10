import { useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import { useRefData } from '../../lib/refdata';
import type { Category } from '../../lib/types';
import { ErrorBox, Field, useToast } from '../../components/ui';

type Tab = 'categories' | 'sources' | 'qse' | 'iso';

export default function ReferenceAdmin() {
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <div className="page page-wide">
      <header className="page-head"><div><h1>Reference lists</h1>
        <p className="muted">Changes apply to new submissions. Items in use can be deactivated but not deleted. Every change is audited.</p></div></header>
      <div className="tabs">
        {([['categories', 'Action categories'], ['sources', 'Sources'], ['qse', 'QSE'], ['iso', 'ISO 15189 clauses']] as [Tab, string][])
          .map(([k, l]) => <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'categories' && <Categories />}
      {tab === 'sources' && <SimpleList table="action_sources" />}
      {tab === 'qse' && <SimpleList table="qse_categories" />}
      {tab === 'iso' && <Clauses />}
    </div>
  );
}

function Categories() {
  const ref = useRefData();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  async function update(c: Category, patch: Partial<Category>) {
    setError(null);
    const { error } = await supabase.from('action_categories').update(patch).eq('id', c.id);
    if (error) setError(errorMessage(error)); else { toast(`${c.name} updated`); await ref.reload(); }
  }
  return (
    <div className="card">
      <div className="alert alert-info">These flags are laboratory <b>policy</b>. They are copied onto each action when it is submitted, so changing them does not alter actions already in progress.</div>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Category</th><th>Always needs approval</th><th>Needs effectiveness review</th><th>Root cause required (Phase 2)</th><th>Active</th></tr></thead>
          <tbody>
            {ref.categories.map(c => (
              <tr key={c.id} className={c.active ? '' : 'row-muted'}>
                <td><b>{c.name}</b><div className="muted small">{c.description}</div></td>
                <td><input type="checkbox" checked={c.requires_approval} onChange={e => update(c, { requires_approval: e.target.checked })} /></td>
                <td><input type="checkbox" checked={c.requires_effectiveness} onChange={e => update(c, { requires_effectiveness: e.target.checked })} /></td>
                <td><input type="checkbox" checked={c.requires_root_cause} onChange={e => update(c, { requires_root_cause: e.target.checked })} /></td>
                <td><input type="checkbox" checked={c.active} onChange={e => update(c, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimpleList({ table }: { table: 'action_sources' | 'qse_categories' }) {
  const ref = useRefData();
  const toast = useToast();
  const items = table === 'action_sources' ? ref.sources : ref.qse;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setError(null);
    const sort = Math.max(0, ...items.map(i => i.sort_order)) + 1;
    const { error } = await supabase.from(table).insert({ code: code.trim().toUpperCase(), name: name.trim(), sort_order: sort });
    if (error) setError(errorMessage(error)); else { setCode(''); setName(''); toast('Added'); await ref.reload(); }
  }
  async function update(id: string, patch: Record<string, unknown>) {
    setError(null);
    const { error } = await supabase.from(table).update(patch).eq('id', id);
    if (error) setError(errorMessage(error)); else { setEdit(e => { const n = { ...e }; delete n[id]; return n; }); toast('Updated'); await ref.reload(); }
  }
  return (
    <div className="card">
      <ErrorBox error={error} />
      {table === 'action_sources' && (
        <div className="row wrap align-end">
          <Field label="Code"><input value={code} onChange={e => setCode(e.target.value)} /></Field>
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
          <button className="btn btn-primary" onClick={add} disabled={!code.trim() || !name.trim()}>Add</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Active</th><th /></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className={i.active ? '' : 'row-muted'}>
                <td className="mono">{i.code}</td>
                <td>{i.id in edit ? <input value={edit[i.id]} onChange={e => setEdit({ ...edit, [i.id]: e.target.value })} /> : i.name}</td>
                <td><input type="checkbox" checked={i.active} onChange={e => update(i.id, { active: e.target.checked })} /></td>
                <td>{i.id in edit
                  ? <button className="btn btn-sm btn-primary" onClick={() => update(i.id, { name: edit[i.id].trim() })} disabled={!edit[i.id].trim()}>Save</button>
                  : <button className="btn btn-sm" onClick={() => setEdit({ ...edit, [i.id]: i.name })}>Rename</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Clauses() {
  const ref = useRefData();
  const toast = useToast();
  const [clause, setClause] = useState('');
  const [title, setTitle] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // 4.1 -> 40100, 7.3.7 -> 70307 (matches the seeded ordering)
  const sortOf = (c: string) => c.split('.').slice(0, 3).map(Number).reduce((acc, n, i) => acc + (isNaN(n) ? 0 : n) * [10000, 100, 1][i], 0);
  async function add() {
    setError(null);
    const { error } = await supabase.from('iso_clauses').insert({ clause: clause.trim(), title: title.trim(), sort_order: sortOf(clause.trim()) });
    if (error) setError(/duplicate|unique/i.test(error.message) ? 'That clause already exists.' : errorMessage(error));
    else { setClause(''); setTitle(''); toast('Clause added'); await ref.reload(); }
  }
  async function update(id: string, patch: Record<string, unknown>) {
    setError(null);
    const { error } = await supabase.from('iso_clauses').update(patch).eq('id', id);
    if (error) setError(errorMessage(error)); else { setEdit(e => { const n = { ...e }; delete n[id]; return n; }); toast('Updated'); await ref.reload(); }
  }
  return (
    <div className="card">
      <div className="alert alert-warn">Clause titles were pre-loaded as short working titles. Check them against your licensed copy of ISO 15189:2022 and add sub-clauses (e.g. 7.3.7) your laboratory references.</div>
      <ErrorBox error={error} />
      <div className="row wrap align-end">
        <Field label="Clause" hint="e.g. 7.3.7"><input value={clause} onChange={e => setClause(e.target.value)} /></Field>
        <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <button className="btn btn-primary" onClick={add} disabled={!/^\d+(\.\d+)*$/.test(clause.trim()) || !title.trim()}>Add clause</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Clause</th><th>Title</th><th>Active</th><th /></tr></thead>
          <tbody>
            {ref.clauses.map(c => (
              <tr key={c.id} className={c.active ? '' : 'row-muted'}>
                <td className="mono">{c.clause}</td>
                <td>{c.id in edit ? <input value={edit[c.id]} onChange={e => setEdit({ ...edit, [c.id]: e.target.value })} /> : c.title}</td>
                <td><input type="checkbox" checked={c.active} onChange={e => update(c.id, { active: e.target.checked })} /></td>
                <td>{c.id in edit
                  ? <button className="btn btn-sm btn-primary" onClick={() => update(c.id, { title: edit[c.id].trim() })} disabled={!edit[c.id].trim()}>Save</button>
                  : <button className="btn btn-sm" onClick={() => setEdit({ ...edit, [c.id]: c.title })}>Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Handle, Position, MarkerType, PanOnScrollMode, addEdge, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { Plus, X, Check, Trash2, Maximize, Save, ZoomIn, ZoomOut, Download, Upload, CopyPlus, Moon, Sun, Cloud } from 'lucide-react'
import mindPalaceBaseJson from './data/mind_palace.json'
import bugBountyBaseJson from './data/bug_bounty_mind_map.json'
import { readRemoteDiagram, syncConfigKey, syncMetaKey, validateGitHubConfig, writeRemoteDiagram, type GitHubSyncConfig, type RemoteDiagram } from './githubSync'

type CardData = { title: string; note?: string; kind: string; color: string; onEdit?: (id: string) => void; onQuickAdd?: (id: string) => void; onQuickDelete?: (id: string) => void }
type StoredDiagram = { nodes: Node<CardData>[]; edges: Edge[] }
type ViewId = 'mind_palace' | 'bug_bounty_mind_map'
type SyncMetadata = { sha: string; diagram: StoredDiagram }
type SyncConflict = { viewId: ViewId; local: StoredDiagram; remote: RemoteDiagram | null }
const views: Record<ViewId,{label:string;storageKey:string;fileName:string;base:StoredDiagram}> = {
  mind_palace:{label:'Mind Palace',storageKey:'mind_palace_state',fileName:'mind_palace.json',base:mindPalaceBaseJson as unknown as StoredDiagram},
  bug_bounty_mind_map:{label:'Bug Bounty Mind Map',storageKey:'bug_bounty_mind_map_state',fileName:'bug_bounty_mind_map.json',base:bugBountyBaseJson as unknown as StoredDiagram},
}
function getExtensionStorage() { return typeof browser !== 'undefined' ? browser?.storage?.local : undefined }
const palette = { stage: '#fff500', input: '#a8cbff', technique: '#c9f3dc', action: '#292d34', plain: '#ffffff' }
const nodeColors = [
  { name: 'Yellow', color: '#fff500' }, { name: 'Orange', color: '#f97316' },
  { name: 'Red', color: '#f87171' }, { name: 'Pink', color: '#f472b6' },
  { name: 'Purple', color: '#c084fc' }, { name: 'Blue', color: '#60a5fa' },
  { name: 'Cyan', color: '#22d3ee' }, { name: 'Green', color: '#4ade80' },
  { name: 'Teal', color: '#2dd4bf' }, { name: 'Neutral gray', color: '#9ca3af' },
  { name: 'Light blue', color: '#a8cbff' }, { name: 'Mint', color: '#c9f3dc' },
  { name: 'Charcoal', color: '#292d34' }, { name: 'White', color: '#ffffff' },
  { name: 'Beige', color: '#f4d7c9' },
]
const edgeAppearance = { type: 'bezier', style: { stroke: '#3984ee', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3984ee' } } satisfies Partial<Edge>
const normalizeEdge = (edge: Edge): Edge => ({ ...edge, ...edgeAppearance, style: { ...edge.style, ...edgeAppearance.style } })
function CardNode({ id, data, selected }: NodeProps<Node<CardData>>) {
  const [hovered,setHovered]=useState(false)
  const leaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const enter=()=>{if(leaveTimer.current)clearTimeout(leaveTimer.current);setHovered(true)}
  const leave=()=>{leaveTimer.current=setTimeout(()=>setHovered(false),140)}
  const stop=(event:React.MouseEvent)=>{event.preventDefault();event.stopPropagation()}
  return <div className={`card-node ${selected ? 'selected' : ''}`} style={{ backgroundColor: data.color, color: ['#292d34','#333333','#222222','#000000'].includes(data.color.toLowerCase()) ? '#f3f4f6' : '#111820' }} onMouseEnter={enter} onMouseLeave={leave} onDoubleClick={() => data.onEdit?.(id)}>
    {hovered&&<div className="node-quick-actions nodrag nopan" onMouseEnter={enter} onMouseLeave={leave}><button type="button" title="Add connected node" aria-label="Add connected node" onMouseDown={stop} onClick={e=>{stop(e);data.onQuickAdd?.(id)}}><CopyPlus size={13}/></button><button type="button" className="quick-delete" title="Delete node" aria-label="Delete node" onMouseDown={stop} onClick={e=>{stop(e);data.onQuickDelete?.(id)}}><Trash2 size={13}/></button></div>}
    <Handle id="target-top" type="target" position={Position.Top} className="handle top target-handle" /><Handle id="source-top" type="source" position={Position.Top} className="handle top source-handle" />
    <Handle id="target-left" type="target" position={Position.Left} className="handle left target-handle" /><Handle id="source-left" type="source" position={Position.Left} className="handle left source-handle" />
    <span>{data.title}</span>
    <Handle id="target-bottom" type="target" position={Position.Bottom} className="handle bottom target-handle" /><Handle id="source-bottom" type="source" position={Position.Bottom} className="handle bottom source-handle" />
    <Handle id="target-right" type="target" position={Position.Right} className="handle right target-handle" /><Handle id="source-right" type="source" position={Position.Right} className="handle right source-handle" />
  </div>
}
function isStoredDiagram(value: unknown): value is StoredDiagram {
  if(!value||typeof value!=='object')return false
  const diagram=value as Partial<StoredDiagram>
  return Array.isArray(diagram.nodes)&&Array.isArray(diagram.edges)&&diagram.nodes.every(n=>!!n&&typeof n.id==='string'&&!!n.position&&Number.isFinite(n.position.x)&&Number.isFinite(n.position.y)&&!!n.data&&typeof n.data.title==='string')&&diagram.edges.every(e=>!!e&&typeof e.id==='string'&&typeof e.source==='string'&&typeof e.target==='string')
}
function sameDiagram(a: StoredDiagram, b: StoredDiagram): boolean { return JSON.stringify(a)===JSON.stringify(b) }
async function loadSyncConfig(storage?: FirefoxStorageArea): Promise<GitHubSyncConfig|null> {
  let value: unknown
  if(storage)value=(await storage.get(syncConfigKey))[syncConfigKey]
  else {const stored=localStorage.getItem(syncConfigKey);if(stored)value=JSON.parse(stored)}
  if(!value||typeof value!=='object')return null
  const config=value as Partial<GitHubSyncConfig>
  return typeof config.owner==='string'&&typeof config.repo==='string'&&typeof config.branch==='string'&&typeof config.token==='string'&&config.token
    ?{owner:config.owner,repo:config.repo,branch:config.branch,token:config.token}:null
}
async function storeSyncConfig(config: GitHubSyncConfig|null, storage?: FirefoxStorageArea): Promise<void> {
  if(storage)await storage.set({[syncConfigKey]:config})
  else if(config)localStorage.setItem(syncConfigKey,JSON.stringify(config))
  else localStorage.removeItem(syncConfigKey)
}
async function loadSyncMetadata(viewId: ViewId, storage?: FirefoxStorageArea): Promise<SyncMetadata|null> {
  let value: unknown
  const key=syncMetaKey(viewId)
  if(storage)value=(await storage.get(key))[key]
  else {const stored=localStorage.getItem(key);if(stored)value=JSON.parse(stored)}
  if(!value||typeof value!=='object')return null
  const meta=value as Partial<SyncMetadata>
  return typeof meta.sha==='string'&&isStoredDiagram(meta.diagram)?{sha:meta.sha,diagram:meta.diagram}:null
}
async function storeSyncMetadata(viewId: ViewId, metadata: SyncMetadata, storage?: FirefoxStorageArea): Promise<void> {
  const key=syncMetaKey(viewId)
  if(storage)await storage.set({[key]:metadata})
  else localStorage.setItem(key,JSON.stringify(metadata))
}
async function reconcileRemote(viewId: ViewId, local: StoredDiagram, config: GitHubSyncConfig, storage?: FirefoxStorageArea): Promise<{diagram:StoredDiagram;conflict?:SyncConflict}> {
  const [remote,meta]=await Promise.all([readRemoteDiagram(config,viewId),loadSyncMetadata(viewId,storage)])
  if(!remote){
    if(meta)return {diagram:local,conflict:{viewId,local,remote:null}}
    return {diagram:local}
  }
  if(!isStoredDiagram(remote.diagram))throw new Error(`The remote ${views[viewId].fileName} file is not a valid diagram.`)
  const remoteDiagram=remote.diagram
  if(!meta){
    if(sameDiagram(local,views[viewId].base)||sameDiagram(local,remoteDiagram)){
      await storeSyncMetadata(viewId,{sha:remote.sha,diagram:remoteDiagram},storage)
      return {diagram:remoteDiagram}
    }
    return {diagram:local,conflict:{viewId,local,remote}}
  }
  if(sameDiagram(local,remoteDiagram)){
    await storeSyncMetadata(viewId,{sha:remote.sha,diagram:remoteDiagram},storage)
    return {diagram:remoteDiagram}
  }
  if(remote.sha===meta.sha)return {diagram:local}
  if(sameDiagram(local,meta.diagram)){
    await storeSyncMetadata(viewId,{sha:remote.sha,diagram:remoteDiagram},storage)
    return {diagram:remoteDiagram}
  }
  return {diagram:local,conflict:{viewId,local,remote}}
}
async function loadViewData(viewId: ViewId, extensionStorage?: FirefoxStorageArea): Promise<StoredDiagram> {
  const view=views[viewId]
  if(extensionStorage){
    const keys=viewId==='bug_bounty_mind_map'?[view.storageKey,'diagram']:[view.storageKey]
    const result=await extensionStorage.get(keys)
    if(isStoredDiagram(result[view.storageKey]))return result[view.storageKey] as StoredDiagram
    if(viewId==='bug_bounty_mind_map'&&isStoredDiagram(result.diagram))return result.diagram as StoredDiagram
    return view.base
  }
  try{
    const stored=localStorage.getItem(view.storageKey)
    if(stored){const parsed=JSON.parse(stored);if(isStoredDiagram(parsed))return parsed}
    if(viewId==='bug_bounty_mind_map'){
      const legacy=localStorage.getItem('branchboard-diagram')
      if(legacy){const parsed=JSON.parse(legacy);if(isStoredDiagram(parsed))return parsed}
    }
  }catch{}
  return view.base
}
function CanvasActions({ onAdd }: { onAdd: () => void }) {
  return <div className="canvas-actions"><button onClick={onAdd}><Plus size={15}/> Add node</button></div>
}
function EditorToolbar({ onSave, onExport, onImport, onOpenSync, status, theme, onToggleTheme, activeView, onSelectView }: { onSave: () => void; onExport: () => void; onImport: () => void; onOpenSync: () => void; status: string; theme: 'light'|'dark'; onToggleTheme: () => void; activeView: ViewId; onSelectView: (view:ViewId)=>void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return <header className="topbar"><div className="topbar-inner"><div className="view-switcher" aria-label="Flowchart view">{(Object.keys(views) as ViewId[]).map(id=><button key={id} type="button" className={activeView===id?'active':''} aria-pressed={activeView===id} onClick={()=>onSelectView(id)}>{views[id].label}</button>)}</div><div className="toolbar-spacer"/><span className="save-status" aria-live="polite">{status}</span><div className="toolbar-controls"><button onClick={onSave} title="Save diagram"><Save/><span>Save</span></button><button onClick={onOpenSync} title="Configure GitHub sync"><Cloud/><span>GitHub Sync</span></button><button onClick={onExport} title="Export diagram as JSON"><Download/><span>Export</span></button><button onClick={onImport} title="Import diagram JSON"><Upload/><span>Import</span></button><button onClick={()=>zoomIn({duration:180})} title="Zoom in"><ZoomIn/><span>Zoom In</span></button><button onClick={()=>zoomOut({duration:180})} title="Zoom out"><ZoomOut/><span>Zoom Out</span></button><button onClick={()=>fitView({padding:.2,duration:350})} title="Fit all nodes in view"><Maximize/><span>Fit View</span></button><button className="theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme==='dark'?'light':'dark'} mode`} aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`}>{theme==='dark'?<Sun/>:<Moon/>}<span>{theme==='dark'?'Light':'Dark'}</span></button></div></div></header>
}
function GitHubSyncDialog({ config, onClose, onSave, onDisconnect }: { config: GitHubSyncConfig|null; onClose: () => void; onSave: (next:GitHubSyncConfig)=>Promise<void>; onDisconnect: () => Promise<void> }) {
  const [owner,setOwner]=useState(config?.owner||'0xHackshat'),[repo,setRepo]=useState(config?.repo||'Bug-Bounty-Framework'),[branch,setBranch]=useState(config?.branch||'main'),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setError('');const next={owner:owner.trim(),repo:repo.trim(),branch:branch.trim(),token:token.trim()||config?.token||''};if(!next.owner||!next.repo||!next.branch||!next.token){setError('Enter the repository, branch, and a GitHub token.');return}setBusy(true);try{await onSave(next)}catch(e){setError(e instanceof Error?e.message:'Could not connect to GitHub.')}finally{setBusy(false)}}
  const disconnect=async()=>{setBusy(true);setError('');try{await onDisconnect()}catch(e){setError(e instanceof Error?e.message:'Could not disconnect GitHub sync.')}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}><form className="sync-dialog" onSubmit={submit}><div className="dialog-head"><div><p className="eyebrow">PERSONAL CLOUD SYNC</p><h2>GitHub sync</h2></div><button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={17}/></button></div><p className="sync-help">Diagrams are stored in <code>{owner||'owner'}/{repo||'repo'}</code> under <code>Main/sync-data/</code>. Use a private repository and a fine-grained token limited to this repository with Contents read/write access.</p><label>Repository owner<input value={owner} onChange={e=>setOwner(e.target.value)} autoComplete="off" required/></label><label>Repository name<input value={repo} onChange={e=>setRepo(e.target.value)} autoComplete="off" required/></label><label>Branch<input value={branch} onChange={e=>setBranch(e.target.value)} autoComplete="off" required/></label><label>Fine-grained GitHub token<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="new-password" placeholder={config?'Token saved; leave blank to keep it':'github_pat_…'} required={!config}/></label>{error&&<p className="sync-error" role="alert">{error}</p>}<p className="sync-help">The token is stored only in this browser profile, not in the project source. Enter it separately on your other device.</p><div className="dialog-actions">{config&&<button type="button" className="secondary" disabled={busy} onClick={()=>void disconnect()}>Disconnect</button>}<span className="toolbar-spacer"/><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?'Connecting…':'Connect'}</button></div></form></div>
}
function SyncConflictDialog({ conflict, onLoadRemote, onKeepLocal, onClose }: { conflict:SyncConflict; onLoadRemote:()=>void; onKeepLocal:()=>void; onClose:()=>void }) {
  return <div className="modal-backdrop"><div className="sync-dialog"><div className="dialog-head"><div><p className="eyebrow">SYNC CONFLICT</p><h2>{views[conflict.viewId].label} changed on another device</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={17}/></button></div><p className="sync-help">{conflict.remote?'The GitHub copy changed since this device last synced. Your local version is safe. Choose which version to keep.':'The GitHub file was removed or is not available on the configured branch. Your local version is safe.'}</p><div className="dialog-actions">{conflict.remote&&<button type="button" className="secondary" onClick={onLoadRemote}>Load GitHub version</button>}<span className="toolbar-spacer"/><button type="button" className="primary" onClick={onKeepLocal}>{conflict.remote?'Overwrite GitHub with local':'Recreate GitHub file from local'}</button></div></div></div>
}
function Inspector({ node, onSave }: { node: Node<CardData>; onSave: (id: string, data: CardData) => void }) {
  const [title,setTitle]=useState(node.data.title), [note,setNote]=useState(node.data.note || ''), [color,setColor]=useState(node.data.color)
  useEffect(()=>{setTitle(node.data.title);setNote(node.data.note||'');setColor(node.data.color)},[node.id])
  const save=()=>onSave(node.id,{...node.data,title,note,color})
  return <aside className="inspector"><div className="inspector-content"><input className="note-title-input" aria-label="Node title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Node title" autoFocus/><textarea className="note-editor" aria-label="Node note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Write a note…" rows={12}/><div className="note-color-picker" aria-label="Node color">{nodeColors.map(({name,color:swatchColor})=><button type="button" key={swatchColor} className={`swatch ${color===swatchColor?'chosen':''}`} style={{background:swatchColor}} onClick={()=>setColor(swatchColor)} aria-label={`Set node color ${name}`} title={name}/>)}</div><button className="primary save-note" onClick={save}><Check size={15}/> Save Note</button></div></aside>
}
function AddNodeDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (d: CardData) => void }) {
 const [title,setTitle]=useState(''),[note,setNote]=useState(''),[kind,setKind]=useState('stage')
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="add-dialog"><div className="dialog-head"><div><p className="eyebrow">NEW CANVAS ITEM</p><h2>Add a node</h2></div><button className="icon-btn" onClick={onClose}><X size={17}/></button></div><label>Title<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Review access controls" onKeyDown={e=>e.key==='Enter'&&title.trim()&&onCreate({title:title.trim(),note,kind,color:palette[kind as keyof typeof palette]})}/></label><label>Note<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional description" rows={3}/></label><label>Category<select value={kind} onChange={e=>setKind(e.target.value)}><option value="stage">Workflow stage</option><option value="input">Input / parameter</option><option value="technique">Technique</option><option value="action">Action / status</option><option value="plain">Heading</option></select></label><div className="dialog-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim()} onClick={()=>onCreate({title:title.trim(),note,kind,color:palette[kind as keyof typeof palette]})}><Plus size={15}/> Create node</button></div></div></div>
}
function EditorApp() {
  const extensionStorage=getExtensionStorage()
  const initial=views.bug_bounty_mind_map.base
  const [nodes,setNodes,onNodesChange]=useNodesState<Node<CardData>>(initial.nodes), [edges,setEdges,onEdgesChange]=useEdgesState<Edge>(initial.edges.map(normalizeEdge)), [activeView,setActiveView]=useState<ViewId>('bug_bounty_mind_map'), [selected,setSelected]=useState<string|null>(null), [addOpen,setAddOpen]=useState(false), [status,setStatus]=useState(''), [theme,setTheme]=useState<'light'|'dark'>(()=>localStorage.getItem('branchboard-theme')==='dark'?'dark':'light'), [storageReady,setStorageReady]=useState(false), [syncConfig,setSyncConfig]=useState<GitHubSyncConfig|null>(null), [syncSettingsOpen,setSyncSettingsOpen]=useState(false), [syncConflict,setSyncConflict]=useState<SyncConflict|null>(null)
  const importRef=useRef<HTMLInputElement>(null)
  const skipNextPersist=useRef(true)
  const switching=useRef(false)
  const {fitView}=useReactFlow()
  const nodeTypes=useMemo(()=>({card:CardNode}),[])
  const onEdit=useCallback((id:string)=>setSelected(id),[])
  useEffect(()=>{let active=true;const initialize=async()=>{let data=await loadViewData('bug_bounty_mind_map',extensionStorage);let config:GitHubSyncConfig|null=null;try{config=await loadSyncConfig(extensionStorage);if(config){const result=await reconcileRemote('bug_bounty_mind_map',data,config,extensionStorage);if(result.conflict)setSyncConflict(result.conflict);if(!sameDiagram(data,result.diagram)){data=result.diagram;const key=views.bug_bounty_mind_map.storageKey;if(extensionStorage)await extensionStorage.set({[key]:data});else localStorage.setItem(key,JSON.stringify(data))}}}catch(error){setStatus(`GitHub sync failed: ${error instanceof Error?error.message:'Unknown error'}`)}if(!active)return;setSyncConfig(config);skipNextPersist.current=true;setNodes(data.nodes);setEdges(data.edges.map(normalizeEdge));setStorageReady(true)};initialize().catch(error=>{if(active){setStatus(`Could not load diagram: ${error instanceof Error?error.message:'Unknown error'}`);setStorageReady(true)}});return()=>{active=false}},[extensionStorage,setNodes,setEdges])
  const persistDiagram=useCallback(async(viewId:ViewId,nextNodes:Node<CardData>[],nextEdges:Edge[])=>{const data={nodes:nextNodes,edges:nextEdges};const key=views[viewId].storageKey;if(extensionStorage)await extensionStorage.set({[key]:data});else localStorage.setItem(key,JSON.stringify(data))},[extensionStorage])
  useEffect(()=>{if(!storageReady)return;if(skipNextPersist.current){skipNextPersist.current=false;return}const timer=window.setTimeout(()=>{void persistDiagram(activeView,nodes,edges).catch(()=>setStatus('Save failed'))},extensionStorage?250:0);return()=>window.clearTimeout(timer)},[nodes,edges,storageReady,activeView,extensionStorage,persistDiagram])
  useEffect(()=>{localStorage.setItem('branchboard-theme',theme)},[theme])
  const flashStatus=(message:string)=>{setStatus(message);window.setTimeout(()=>setStatus(current=>current===message?'':current),2400)}
  const saveDiagram=async()=>{
    const data:StoredDiagram={nodes,edges}
    try{
      await persistDiagram(activeView,nodes,edges)
      if(!syncConfig){flashStatus('Saved locally — GitHub not connected');return}
      const [remote,meta]=await Promise.all([readRemoteDiagram(syncConfig,activeView),loadSyncMetadata(activeView,extensionStorage)])
      let remoteDiagram:StoredDiagram|undefined
      if(remote){if(!isStoredDiagram(remote.diagram))throw new Error(`The remote ${views[activeView].fileName} file is not a valid diagram.`);remoteDiagram=remote.diagram}
      if(remote&&remoteDiagram&&sameDiagram(data,remoteDiagram)){
        await storeSyncMetadata(activeView,{sha:remote.sha,diagram:remoteDiagram},extensionStorage)
        flashStatus('Already synced')
        return
      }
      if(remote&&meta&&remote.sha!==meta.sha){
        if(remoteDiagram&&sameDiagram(data,meta.diagram)){
          await persistDiagram(activeView,remoteDiagram.nodes,remoteDiagram.edges)
          await storeSyncMetadata(activeView,{sha:remote.sha,diagram:remoteDiagram},extensionStorage)
          skipNextPersist.current=true
          setNodes(remoteDiagram.nodes)
          setEdges(remoteDiagram.edges.map(normalizeEdge))
          flashStatus('Loaded newer GitHub version')
        }else{
          setSyncConflict({viewId:activeView,local:data,remote})
          flashStatus('Conflict: review both versions')
        }
        return
      }
      if(remote&&!meta){
        setSyncConflict({viewId:activeView,local:data,remote})
        flashStatus('Conflict: review both versions')
        return
      }
      if(!remote&&meta){
        setSyncConflict({viewId:activeView,local:data,remote:null})
        flashStatus('Conflict: GitHub copy is missing')
        return
      }
      try{
        const sha=await writeRemoteDiagram(syncConfig,activeView,data,remote?.sha)
        await storeSyncMetadata(activeView,{sha,diagram:data},extensionStorage)
        flashStatus('Saved and synced to GitHub')
      }catch(error){
        const latest=await readRemoteDiagram(syncConfig,activeView)
        if((latest?.sha??null)!==(remote?.sha??null)){
          if(latest&&!isStoredDiagram(latest.diagram))throw new Error('GitHub changed to an invalid diagram.')
          setSyncConflict({viewId:activeView,local:data,remote:latest})
          flashStatus('GitHub changed during save; review the conflict')
          return
        }
        throw error
      }
    }catch(error){flashStatus(`Save failed: ${error instanceof Error?error.message:'Unknown error'}`)}
  }
  const saveSyncSettings=async(next:GitHubSyncConfig)=>{await validateGitHubConfig(next);await storeSyncConfig(next,extensionStorage);setSyncConfig(next);setSyncSettingsOpen(false);try{const local={nodes,edges};const result=await reconcileRemote(activeView,local,next,extensionStorage);if(result.conflict){setSyncConflict(result.conflict);flashStatus('Connected; resolve the sync conflict')}else if(!sameDiagram(local,result.diagram)){await persistDiagram(activeView,result.diagram.nodes,result.diagram.edges);skipNextPersist.current=true;setNodes(result.diagram.nodes);setEdges(result.diagram.edges.map(normalizeEdge));flashStatus('Connected and loaded GitHub version')}else flashStatus('GitHub sync connected')}catch(error){flashStatus(`Connected, but sync failed: ${error instanceof Error?error.message:'Unknown error'}`)}}
  const disconnectSync=async()=>{await storeSyncConfig(null,extensionStorage);setSyncConfig(null);setSyncSettingsOpen(false);flashStatus('GitHub sync disconnected')}
  const loadConflictRemote=async()=>{if(!syncConflict?.remote)return;try{const {viewId,remote}=syncConflict;if(!isStoredDiagram(remote.diagram))throw new Error('The remote diagram is invalid.');const diagram=remote.diagram;await persistDiagram(viewId,diagram.nodes,diagram.edges);await storeSyncMetadata(viewId,{sha:remote.sha,diagram},extensionStorage);if(viewId===activeView){skipNextPersist.current=true;setNodes(diagram.nodes);setEdges(diagram.edges.map(normalizeEdge))}setSyncConflict(null);flashStatus('Loaded GitHub version')}catch(error){flashStatus(`Could not load GitHub version: ${error instanceof Error?error.message:'Unknown error'}`)}}
  const keepConflictLocal=async()=>{if(!syncConflict||!syncConfig)return;const conflict=syncConflict;try{const latest=await readRemoteDiagram(syncConfig,conflict.viewId);if((latest?.sha??null)!==(conflict.remote?.sha??null)){setSyncConflict({...conflict,remote:latest});flashStatus('GitHub changed again; review the updated conflict');return}if(latest&&!isStoredDiagram(latest.diagram))throw new Error('The remote diagram is invalid.');const sha=await writeRemoteDiagram(syncConfig,conflict.viewId,conflict.local,latest?.sha);await storeSyncMetadata(conflict.viewId,{sha,diagram:conflict.local},extensionStorage);await persistDiagram(conflict.viewId,conflict.local.nodes,conflict.local.edges);if(conflict.viewId===activeView){skipNextPersist.current=true;setNodes(conflict.local.nodes);setEdges(conflict.local.edges.map(normalizeEdge))}setSyncConflict(null);flashStatus('Local version saved to GitHub')}catch(error){flashStatus(`Could not save local version: ${error instanceof Error?error.message:'Unknown error'}`)}}
  const exportDiagram=()=>{const blob=new Blob([JSON.stringify({nodes,edges},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=views[activeView].fileName;link.click();URL.revokeObjectURL(url);flashStatus('Exported')}
  const importDiagram=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||!Array.isArray(parsed.nodes)||!Array.isArray(parsed.edges)||parsed.nodes.length>5000||parsed.edges.length>10000)throw new Error('Invalid diagram structure');const ids=new Set<string>();for(const node of parsed.nodes){if(!node||typeof node.id!=='string'||!node.id||ids.has(node.id)||!node.position||!Number.isFinite(node.position.x)||!Number.isFinite(node.position.y)||!node.data||typeof node.data.title!=='string'||typeof node.data.kind!=='string'||typeof node.data.color!=='string'||(node.data.note!==undefined&&typeof node.data.note!=='string'))throw new Error('Invalid node data');ids.add(node.id)}for(const edge of parsed.edges){if(!edge||typeof edge.id!=='string'||typeof edge.source!=='string'||typeof edge.target!=='string'||!ids.has(edge.source)||!ids.has(edge.target)||edge.source===edge.target)throw new Error('Invalid edge data')}const importedNodes=parsed.nodes as Node<CardData>[],importedEdges=(parsed.edges as Edge[]).map(normalizeEdge);setNodes(importedNodes);setEdges(importedEdges);setSelected(null);void persistDiagram(activeView,importedNodes,importedEdges);flashStatus('Imported')}catch(error){flashStatus(error instanceof SyntaxError?'Invalid JSON: malformed or incomplete':'Invalid flowchart data')}};reader.onerror=()=>flashStatus('Could not read file');reader.readAsText(file)}
  const selectView=async(viewId:ViewId)=>{if(viewId===activeView||switching.current)return;switching.current=true;try{await persistDiagram(activeView,nodes,edges);let data=await loadViewData(viewId,extensionStorage);const local=data;if(syncConfig){const result=await reconcileRemote(viewId,data,syncConfig,extensionStorage);data=result.diagram;if(result.conflict)setSyncConflict(result.conflict);if(!sameDiagram(local,data)){const key=views[viewId].storageKey;if(extensionStorage)await extensionStorage.set({[key]:data});else localStorage.setItem(key,JSON.stringify(data))}}skipNextPersist.current=true;setNodes(data.nodes);setEdges(data.edges.map(normalizeEdge));setSelected(null);setActiveView(viewId);requestAnimationFrame(()=>requestAnimationFrame(()=>fitView({padding:.2,duration:250})))}catch(error){flashStatus(`Could not switch view: ${error instanceof Error?error.message:'Unknown error'}`)}finally{switching.current=false}}
  const connect=useCallback((connection:Connection)=>{if(connection.source===connection.target)return;setEdges(es=>addEdge(normalizeEdge(connection as Edge),es))},[setEdges])
  const addNode=useCallback((data:CardData)=>{const id=crypto.randomUUID();setNodes(ns=>[...ns,{id,type:'card',position:{x:400+Math.random()*100,y:820+Math.random()*50},data}]);setAddOpen(false);setSelected(id)},[setNodes])
  const saveNode=(id:string,data:CardData)=>setNodes(ns=>ns.map(n=>n.id===id?{...n,data}:n))
  const deleteNode=useCallback((id:string)=>{setNodes(ns=>ns.filter(n=>n.id!==id));setEdges(es=>es.filter(e=>e.source!==id&&e.target!==id));setSelected(null)},[setNodes,setEdges])
  const quickAdd=useCallback((parentId:string)=>{const parent=nodes.find(n=>n.id===parentId);if(!parent)return;const id=crypto.randomUUID();const offsets=[{x:0,y:94},{x:0,y:188},{x:210,y:0},{x:-210,y:0},{x:0,y:-94},{x:210,y:94},{x:-210,y:94},{x:210,y:-94},{x:-210,y:-94},{x:0,y:282},{x:420,y:0},{x:-420,y:0}];const occupied=nodes.map(n=>n.position);const offset=offsets.find(o=>!occupied.some(p=>Math.abs(p.x-(parent.position.x+o.x))<165&&Math.abs(p.y-(parent.position.y+o.y))<58))||{x:0,y:376};const node:Node<CardData>={id,type:'card',position:{x:parent.position.x+offset.x,y:parent.position.y+offset.y},data:{title:'New node',kind:'stage',color:palette.stage}};const horizontal=Math.abs(offset.x)>Math.abs(offset.y);const sourceHandle=horizontal?(offset.x>0?'source-right':'source-left'):(offset.y>0?'source-bottom':'source-top');const targetHandle=horizontal?(offset.x>0?'target-left':'target-right'):(offset.y>0?'target-top':'target-bottom');const edge=normalizeEdge({id:`quick-${parentId}-${id}`,source:parentId,target:id,sourceHandle,targetHandle} as Edge);setNodes(ns=>[...ns,node]);setEdges(es=>[...es,edge]);setSelected(id)},[nodes,setNodes,setEdges])
  const enriched=useMemo(()=>nodes.map(n=>({...n,data:{...n.data,onEdit,onQuickAdd:quickAdd,onQuickDelete:deleteNode}})),[nodes,onEdit,quickAdd,deleteNode])
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.key==='Delete'||e.key==='Backspace')&&selected&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName))deleteNode(selected);if(e.key==='Escape'){setSelected(null);setAddOpen(false)}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[selected])
  const selectedNode=nodes.find(n=>n.id===selected)
  return <div className={`app-shell ${theme==='dark'?'dark-theme':''}`}>
    <EditorToolbar onSave={saveDiagram} onExport={exportDiagram} onImport={()=>importRef.current?.click()} onOpenSync={()=>setSyncSettingsOpen(true)} status={status} theme={theme} onToggleTheme={()=>setTheme(t=>t==='dark'?'light':'dark')} activeView={activeView} onSelectView={selectView}/>
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e=>{importDiagram(e.target.files?.[0]);e.currentTarget.value=''}}/>
    <section className="canvas-section"><div className="canvas-inner"><ReactFlow nodes={enriched} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} nodeTypes={nodeTypes} defaultEdgeOptions={edgeAppearance} onNodeClick={(_,node)=>setSelected(node.id)} onPaneClick={()=>setSelected(null)} onEdgeClick={(_,edge)=>setEdges(es=>es.filter(e=>e.id!==edge.id))} nodesDraggable nodesConnectable elementsSelectable fitView fitViewOptions={{padding:.2}} minZoom={.25} maxZoom={2} deleteKeyCode={['Backspace','Delete']} selectionOnDrag multiSelectionKeyCode="Shift" panOnDrag={[1,2]} panOnScroll panOnScrollMode={PanOnScrollMode.Free} zoomOnScroll={false} zoomOnPinch proOptions={{hideAttribution:true}}><Background color={theme==='dark'?'#45484d':'#d9e0e9'} gap={18} size={1} variant={BackgroundVariant.Dots}/><MiniMap pannable zoomable nodeColor={n=>(n.data as CardData).color}/><CanvasActions onAdd={()=>setAddOpen(true)}/></ReactFlow></div>{selectedNode&&<Inspector key={selectedNode.id} node={selectedNode} onSave={saveNode}/>}</section>
    {addOpen&&<AddNodeDialog onClose={()=>setAddOpen(false)} onCreate={addNode}/>}
    {syncSettingsOpen&&<GitHubSyncDialog config={syncConfig} onClose={()=>setSyncSettingsOpen(false)} onSave={saveSyncSettings} onDisconnect={disconnectSync}/>}
    {syncConflict&&<SyncConflictDialog conflict={syncConflict} onLoadRemote={()=>void loadConflictRemote()} onKeepLocal={()=>void keepConflictLocal()} onClose={()=>setSyncConflict(null)}/>}
  </div>
}
export default function App(){return <ReactFlowProvider><EditorApp/></ReactFlowProvider>}

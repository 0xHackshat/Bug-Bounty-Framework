import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Handle, Position, MarkerType, PanOnScrollMode, addEdge, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { Plus, X, Check, Trash2, Maximize, Save, ZoomIn, ZoomOut, Download, Upload, CopyPlus, Moon, Sun } from 'lucide-react'
import mindPalaceBaseJson from './data/mind_palace.json'
import bugBountyBaseJson from './data/bug_bounty_mind_map.json'

type CardData = { title: string; note?: string; kind: string; color: string; onEdit?: (id: string) => void; onQuickAdd?: (id: string) => void; onQuickDelete?: (id: string) => void }
type StoredDiagram = { nodes: Node<CardData>[]; edges: Edge[] }
type ViewId = 'mind_palace' | 'bug_bounty_mind_map'
const views: Record<ViewId,{label:string;storageKey:string;fileName:string;base:StoredDiagram}> = {
  mind_palace:{label:'Mind Palace',storageKey:'mind_palace_state',fileName:'mind_palace.json',base:mindPalaceBaseJson as unknown as StoredDiagram},
  bug_bounty_mind_map:{label:'Bug Bounty Mind Map',storageKey:'bug_bounty_mind_map_state',fileName:'bug_bounty_mind_map.json',base:bugBountyBaseJson as unknown as StoredDiagram},
}
function getExtensionStorage() { return typeof browser !== 'undefined' ? browser?.storage?.local : undefined }
const palette = { stage: '#fff500', input: '#a8cbff', technique: '#c9f3dc', action: '#292d34', plain: '#ffffff' }
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
function EditorToolbar({ onSave, onExport, onImport, status, theme, onToggleTheme, activeView, onSelectView }: { onSave: () => void; onExport: () => void; onImport: () => void; status: string; theme: 'light'|'dark'; onToggleTheme: () => void; activeView: ViewId; onSelectView: (view:ViewId)=>void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return <header className="topbar"><div className="topbar-inner"><div className="view-switcher" aria-label="Flowchart view">{(Object.keys(views) as ViewId[]).map(id=><button key={id} type="button" className={activeView===id?'active':''} aria-pressed={activeView===id} onClick={()=>onSelectView(id)}>{views[id].label}</button>)}</div><div className="toolbar-spacer"/><span className="save-status" aria-live="polite">{status}</span><div className="toolbar-controls"><button onClick={onSave} title="Save diagram"><Save/><span>Save</span></button><button onClick={onExport} title="Export diagram as JSON"><Download/><span>Export</span></button><button onClick={onImport} title="Import diagram JSON"><Upload/><span>Import</span></button><button onClick={()=>zoomIn({duration:180})} title="Zoom in"><ZoomIn/><span>Zoom In</span></button><button onClick={()=>zoomOut({duration:180})} title="Zoom out"><ZoomOut/><span>Zoom Out</span></button><button onClick={()=>fitView({padding:.2,duration:350})} title="Fit all nodes in view"><Maximize/><span>Fit View</span></button><button className="theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme==='dark'?'light':'dark'} mode`} aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`}>{theme==='dark'?<Sun/>:<Moon/>}<span>{theme==='dark'?'Light':'Dark'}</span></button></div></div></header>
}
function Inspector({ node, onSave }: { node: Node<CardData>; onSave: (id: string, data: CardData) => void }) {
  const [title,setTitle]=useState(node.data.title), [note,setNote]=useState(node.data.note || ''), [color,setColor]=useState(node.data.color)
  useEffect(()=>{setTitle(node.data.title);setNote(node.data.note||'');setColor(node.data.color)},[node.id])
  const save=()=>onSave(node.id,{...node.data,title,note,color})
  return <aside className="inspector"><div className="inspector-content"><input className="note-title-input" aria-label="Node title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Node title" autoFocus/><textarea className="note-editor" aria-label="Node note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Write a note…" rows={12}/><div className="note-color-picker" aria-label="Node color">{['#fff500','#a8cbff','#c9f3dc','#292d34','#ffffff','#f4d7c9'].map(c=><button type="button" key={c} className={`swatch ${color===c?'chosen':''}`} style={{background:c}} onClick={()=>setColor(c)} aria-label={`Set color ${c}`}/>)}</div><button className="primary save-note" onClick={save}><Check size={15}/> Save Note</button></div></aside>
}
function AddNodeDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (d: CardData) => void }) {
 const [title,setTitle]=useState(''),[note,setNote]=useState(''),[kind,setKind]=useState('stage')
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="add-dialog"><div className="dialog-head"><div><p className="eyebrow">NEW CANVAS ITEM</p><h2>Add a node</h2></div><button className="icon-btn" onClick={onClose}><X size={17}/></button></div><label>Title<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Review access controls" onKeyDown={e=>e.key==='Enter'&&title.trim()&&onCreate({title:title.trim(),note,kind,color:palette[kind as keyof typeof palette]})}/></label><label>Note<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional description" rows={3}/></label><label>Category<select value={kind} onChange={e=>setKind(e.target.value)}><option value="stage">Workflow stage</option><option value="input">Input / parameter</option><option value="technique">Technique</option><option value="action">Action / status</option><option value="plain">Heading</option></select></label><div className="dialog-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim()} onClick={()=>onCreate({title:title.trim(),note,kind,color:palette[kind as keyof typeof palette]})}><Plus size={15}/> Create node</button></div></div></div>
}
function EditorApp() {
  const extensionStorage=getExtensionStorage()
  const initial=views.bug_bounty_mind_map.base
  const [nodes,setNodes,onNodesChange]=useNodesState<Node<CardData>>(initial.nodes), [edges,setEdges,onEdgesChange]=useEdgesState<Edge>(initial.edges.map(normalizeEdge)), [activeView,setActiveView]=useState<ViewId>('bug_bounty_mind_map'), [selected,setSelected]=useState<string|null>(null), [addOpen,setAddOpen]=useState(false), [status,setStatus]=useState(''), [theme,setTheme]=useState<'light'|'dark'>(()=>localStorage.getItem('branchboard-theme')==='dark'?'dark':'light'), [storageReady,setStorageReady]=useState(false)
  const importRef=useRef<HTMLInputElement>(null)
  const skipNextPersist=useRef(true)
  const switching=useRef(false)
  const {fitView}=useReactFlow()
  const nodeTypes=useMemo(()=>({card:CardNode}),[])
  const onEdit=useCallback((id:string)=>setSelected(id),[])
  useEffect(()=>{let active=true;loadViewData('bug_bounty_mind_map',extensionStorage).then(data=>{if(!active)return;skipNextPersist.current=true;setNodes(data.nodes);setEdges(data.edges.map(normalizeEdge));setStorageReady(true)}).catch(()=>{if(active)setStorageReady(true)});return()=>{active=false}},[extensionStorage,setNodes,setEdges])
  const persistDiagram=useCallback(async(viewId:ViewId,nextNodes:Node<CardData>[],nextEdges:Edge[])=>{const data={nodes:nextNodes,edges:nextEdges};const key=views[viewId].storageKey;if(extensionStorage)await extensionStorage.set({[key]:data});else localStorage.setItem(key,JSON.stringify(data))},[extensionStorage])
  useEffect(()=>{if(!storageReady)return;if(skipNextPersist.current){skipNextPersist.current=false;return}const timer=window.setTimeout(()=>{void persistDiagram(activeView,nodes,edges).catch(()=>setStatus('Save failed'))},extensionStorage?250:0);return()=>window.clearTimeout(timer)},[nodes,edges,storageReady,activeView,extensionStorage,persistDiagram])
  useEffect(()=>{localStorage.setItem('branchboard-theme',theme)},[theme])
  const flashStatus=(message:string)=>{setStatus(message);window.setTimeout(()=>setStatus(current=>current===message?'':current),2400)}
  const saveDiagram=()=>{void persistDiagram(activeView,nodes,edges).then(()=>flashStatus('Saved')).catch(()=>flashStatus('Save failed'))}
  const exportDiagram=()=>{const blob=new Blob([JSON.stringify({nodes,edges},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=views[activeView].fileName;link.click();URL.revokeObjectURL(url);flashStatus('Exported')}
  const importDiagram=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||!Array.isArray(parsed.nodes)||!Array.isArray(parsed.edges)||parsed.nodes.length>5000||parsed.edges.length>10000)throw new Error('Invalid diagram structure');const ids=new Set<string>();for(const node of parsed.nodes){if(!node||typeof node.id!=='string'||!node.id||ids.has(node.id)||!node.position||!Number.isFinite(node.position.x)||!Number.isFinite(node.position.y)||!node.data||typeof node.data.title!=='string'||typeof node.data.kind!=='string'||typeof node.data.color!=='string'||(node.data.note!==undefined&&typeof node.data.note!=='string'))throw new Error('Invalid node data');ids.add(node.id)}for(const edge of parsed.edges){if(!edge||typeof edge.id!=='string'||typeof edge.source!=='string'||typeof edge.target!=='string'||!ids.has(edge.source)||!ids.has(edge.target)||edge.source===edge.target)throw new Error('Invalid edge data')}const importedNodes=parsed.nodes as Node<CardData>[],importedEdges=(parsed.edges as Edge[]).map(normalizeEdge);setNodes(importedNodes);setEdges(importedEdges);setSelected(null);void persistDiagram(activeView,importedNodes,importedEdges);flashStatus('Imported')}catch(error){flashStatus(error instanceof SyntaxError?'Invalid JSON: malformed or incomplete':'Invalid flowchart data')}};reader.onerror=()=>flashStatus('Could not read file');reader.readAsText(file)}
  const selectView=async(viewId:ViewId)=>{if(viewId===activeView||switching.current)return;switching.current=true;try{await persistDiagram(activeView,nodes,edges);const data=await loadViewData(viewId,extensionStorage);skipNextPersist.current=true;setNodes(data.nodes);setEdges(data.edges.map(normalizeEdge));setSelected(null);setActiveView(viewId);requestAnimationFrame(()=>requestAnimationFrame(()=>fitView({padding:.2,duration:250})))}catch{flashStatus('Could not switch view')}finally{switching.current=false}}
  const connect=useCallback((connection:Connection)=>{if(connection.source===connection.target)return;setEdges(es=>addEdge(normalizeEdge(connection as Edge),es))},[setEdges])
  const addNode=useCallback((data:CardData)=>{const id=crypto.randomUUID();setNodes(ns=>[...ns,{id,type:'card',position:{x:400+Math.random()*100,y:820+Math.random()*50},data}]);setAddOpen(false);setSelected(id)},[setNodes])
  const saveNode=(id:string,data:CardData)=>setNodes(ns=>ns.map(n=>n.id===id?{...n,data}:n))
  const deleteNode=useCallback((id:string)=>{setNodes(ns=>ns.filter(n=>n.id!==id));setEdges(es=>es.filter(e=>e.source!==id&&e.target!==id));setSelected(null)},[setNodes,setEdges])
  const quickAdd=useCallback((parentId:string)=>{const parent=nodes.find(n=>n.id===parentId);if(!parent)return;const id=crypto.randomUUID();const offsets=[{x:0,y:94},{x:0,y:188},{x:210,y:0},{x:-210,y:0},{x:0,y:-94},{x:210,y:94},{x:-210,y:94},{x:210,y:-94},{x:-210,y:-94},{x:0,y:282},{x:420,y:0},{x:-420,y:0}];const occupied=nodes.map(n=>n.position);const offset=offsets.find(o=>!occupied.some(p=>Math.abs(p.x-(parent.position.x+o.x))<165&&Math.abs(p.y-(parent.position.y+o.y))<58))||{x:0,y:376};const node:Node<CardData>={id,type:'card',position:{x:parent.position.x+offset.x,y:parent.position.y+offset.y},data:{title:'New node',kind:'stage',color:palette.stage}};const horizontal=Math.abs(offset.x)>Math.abs(offset.y);const sourceHandle=horizontal?(offset.x>0?'source-right':'source-left'):(offset.y>0?'source-bottom':'source-top');const targetHandle=horizontal?(offset.x>0?'target-left':'target-right'):(offset.y>0?'target-top':'target-bottom');const edge=normalizeEdge({id:`quick-${parentId}-${id}`,source:parentId,target:id,sourceHandle,targetHandle} as Edge);setNodes(ns=>[...ns,node]);setEdges(es=>[...es,edge]);setSelected(id)},[nodes,setNodes,setEdges])
  const enriched=useMemo(()=>nodes.map(n=>({...n,data:{...n.data,onEdit,onQuickAdd:quickAdd,onQuickDelete:deleteNode}})),[nodes,onEdit,quickAdd,deleteNode])
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.key==='Delete'||e.key==='Backspace')&&selected&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName))deleteNode(selected);if(e.key==='Escape'){setSelected(null);setAddOpen(false)}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[selected])
  const selectedNode=nodes.find(n=>n.id===selected)
  return <div className={`app-shell ${theme==='dark'?'dark-theme':''}`}><EditorToolbar onSave={saveDiagram} onExport={exportDiagram} onImport={()=>importRef.current?.click()} status={status} theme={theme} onToggleTheme={()=>setTheme(t=>t==='dark'?'light':'dark')} activeView={activeView} onSelectView={selectView}/><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e=>{importDiagram(e.target.files?.[0]);e.currentTarget.value=''}}/><section className="canvas-section"><div className="canvas-inner"><ReactFlow nodes={enriched} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} nodeTypes={nodeTypes} defaultEdgeOptions={edgeAppearance} onNodeClick={(_,node)=>setSelected(node.id)} onPaneClick={()=>setSelected(null)} onEdgeClick={(_,edge)=>setEdges(es=>es.filter(e=>e.id!==edge.id))} nodesDraggable nodesConnectable elementsSelectable fitView fitViewOptions={{padding:.2}} minZoom={.25} maxZoom={2} deleteKeyCode={['Backspace','Delete']} selectionOnDrag multiSelectionKeyCode="Shift" panOnDrag={[1,2]} panOnScroll panOnScrollMode={PanOnScrollMode.Free} zoomOnScroll={false} zoomOnPinch proOptions={{hideAttribution:true}}><Background color={theme==='dark'?'#303236':'#e9edf3'} gap={18} size={1} variant={BackgroundVariant.Dots}/><MiniMap pannable zoomable nodeColor={n=>(n.data as CardData).color}/><CanvasActions onAdd={()=>setAddOpen(true)}/></ReactFlow></div>{selectedNode&&<Inspector key={selectedNode.id} node={selectedNode} onSave={saveNode}/>}</section>{addOpen&&<AddNodeDialog onClose={()=>setAddOpen(false)} onCreate={addNode}/>}</div>
}
export default function App(){return <ReactFlowProvider><EditorApp/></ReactFlowProvider>}

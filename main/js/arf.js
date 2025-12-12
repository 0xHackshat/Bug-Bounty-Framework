var margin = [20, 120, 20, 140],
   width = 1280 - margin[1] - margin[3],
   height = 750 - margin[0] - margin[2],
   i = 0,
   duration = 1250,
   root;

var tree = d3.layout.tree()
   .size([height, width]);

var diagonal = d3.svg.diagonal()
   .projection(function (d) {
      return [d.y, d.x];
   });

var vis = d3.select("#body").append("svg:svg")
   .attr("width", width + margin[1] + margin[3])
   .attr("height", height + margin[0] + margin[2])
   .append("svg:g")
   .attr("transform", "translate(" + margin[3] + "," + margin[0] + ")");

const fsSupported = ('showSaveFilePicker' in window) && ('showOpenFilePicker' in window || 'showOpenFilePicker' in window);


// global in arf.js (or separate projectManager.js)
let currentProject = {
   name: null,
   root: null, // the tree root object used by d3 (root variable)
   fileHandle: null, // FileSystemFileHandle if opened via FS API
   dirHandle: null, // FileSystemDirectoryHandle if opened
   dirty: false
};


// d3.json("arf.json", function(json) { //replace with below line 


d3.json(chrome.runtime.getURL("default.json"), function (json) {

   root = json;
   root.x0 = height / 2;
   root.y0 = 0;

   function collapse(d) {
      if (d.children) {
         d._children = d.children;
         d._children.forEach(collapse);
         d.children = null;
      }
   }

   /*  function toggleAll(d) {
       if (d.children) {
         d.children.forEach(toggleAll);
         toggle(d);
       }
     } */
   root.children.forEach(collapse);
   update(root);
});

function collapseAll() {
   if (!root) return;

   function collapseNode(d) {
      if (d.children) {
         d._children = d.children;
         d._children.forEach(collapseNode);
         d.children = null;
      }
   }

   collapseNode(root);
   update(root);
}


function update(source) {
   // var duration = d3.event && d3.event.altKey ? 5000 : 500;

   // Compute the new tree layout.
   var nodes = tree.nodes(root).reverse();

   // Normalize for fixed-depth.
   nodes.forEach(function (d) {
      d.y = d.depth * 180;
   });

   // Update the nodes…
   var node = vis.selectAll("g.node")
      .data(nodes, function (d) {
         return d.id || (d.id = ++i);
      });

   // Enter any new nodes at the parent's previous position.
   var nodeEnter = node.enter().append("svg:g")
      .attr("class", "node")
      .attr("transform", function (d) {
         return "translate(" + source.y0 + "," + source.x0 + ")";
      })
      .on("click", function (d) { // <-- restore original toggle-on-group behavior (D3 v3 style)
         toggle(d);
         update(d);
      });

   // Circle (original behavior)
   nodeEnter.append("svg:circle")
      .attr("r", 1e-6)
      .style("fill", function (d) {
         return d._children ? "lightsteelblue" : "#fff";
      });

   // today // Node text with its anchor; stop propagation when clicking the text/link so it doesn't toggle the node
   // nodeEnter.append('a')
   //    .attr("target", "_blank")
   //    .attr('xlink:href', function (d) {
   //       return d.url;
   //    })
   //    .append("svg:text")
   //    .attr("x", function (d) {
   //       return d.children || d._children ? -10 : 10;
   //    })
   //    .attr("dy", ".35em")
   //    .attr("text-anchor", function (d) {
   //       return d.children || d._children ? "end" : "start";
   //    })
   //    .text(function (d) {
   //       return d.name;
   //    })
   //    .style("fill", function (d) {
   //       return d.free ? 'black' : '#999';
   //    }) // <-- use "fill" correctly
   //    .style("fill-opacity", 1e-6)
   //    .on("click", function (d) {
   //       d3.event.stopPropagation(); // D3 v3 way of stopping group click
   //    });

   // Node text with an anchor; clicking text toggles 'completed'
nodeEnter.append('a')
   .attr("target", "_blank")
   .attr('xlink:href', function (d) {
      return d.url;
   })
   .append("svg:text")
   .style("font-family", "Arial, Helvetica, sans-serif")
   .style("font-size", "15px")
   .style("fill", "#d7e819ff")
   .attr("x", function (d) {
      return d.children || d._children ? -10 : 10;
   })
   .attr("dy", ".35em")
   .attr("text-anchor", function (d) {
      return d.children || d._children ? "end" : "start";
   })
   .text(function (d) {
      return d.name;
   })
   .style("fill", function (d) {
      return d.free ? 'black' : '#999';
   })
   .style("fill-opacity", 1e-6)
   // show strike-through if completed initially
   .style("text-decoration", function(d) { return d.completed ? "line-through" : "none"; })
   .style("cursor", "pointer")
   .on("click", function (d) {
      // Prevent group toggle and link navigation when toggling completed
      d3.event.stopPropagation();
      d3.event.preventDefault();

      // Toggle completed state and mark project dirty
      toggleCompleted(d);

      // Re-render the tree starting from this node so visuals update
      update(d);
   });


// today 

   // NOTE icon next to the text (click opens note panel; stops propagation)
   // nodeEnter.append("svg:text")
   //     .attr("class", "note-icon")
   //     .attr("x", 20)
   //     .attr("dy", ".35em")
   //     .text("✏️")
   //     .style("cursor", "pointer")
   //     .on("click", function(d) {
   //       d3.event.stopPropagation(); // important: D3 v3 event API
   //       openNotePanel(d);
   //     });

   // preserve original title tooltip
   nodeEnter.append("svg:title")
      .text(function (d) {
         return d.description;
      });
   nodeEnter.append("svg:text")
      .attr("class", "note-icon")
      .attr("x", 10)
      .attr("dy", ".35em")
      .text(function (d) {
   return d.completed ? "✅" : "📌";
})
.style("cursor", "pointer")
.style("fill", function (d) {
   if (d.completed) return "limegreen";
   if (d.note) return "orange";
   return "gray";
})

      .on("click", function (d) {
         d3.event.stopPropagation();
         openNotePanel(d);
      });


   // Transition nodes to their new position.
   var nodeUpdate = node.transition()
      .duration(duration)
      .attr("transform", function (d) {
         return "translate(" + d.y + "," + d.x + ")";
      });

   nodeUpdate.select("circle")
      .attr("r", 6)
      .style("fill", function (d) {
         return d._children ? "lightsteelblue" : "#fff";
      });

   // nodeUpdate.select("text")
   //    .style("fill-opacity", 1);

// today

   nodeUpdate.select("text")
   .style("fill-opacity", 1)
   .style("text-decoration", function(d) { return d.completed ? "line-through" : "none"; });


   // Transition exiting nodes to the parent's new position.
   var nodeExit = node.exit().transition()
      .duration(duration)
      .attr("transform", function (d) {
         return "translate(" + source.y + "," + source.x + ")";
      })
      .remove();

   nodeExit.select("circle")
      .attr("r", 1e-6);

   nodeExit.select("text")
      .style("fill-opacity", 1e-6);

   // Update the links…
   var link = vis.selectAll("path.link")
      .data(tree.links(nodes), function (d) {
         return d.target.id;
      });

   // Enter any new links at the parent's previous position.
   link.enter().insert("svg:path", "g")
      .attr("class", "link")
      .attr("d", function (d) {
         var o = {
            x: source.x0,
            y: source.y0
         };
         return diagonal({
            source: o,
            target: o
         });
      })
      .transition()
      .duration(duration)
      .attr("d", diagonal);

   // Transition links to their new position.
   link.transition()
      .duration(duration)
      .attr("d", diagonal);

   // Transition exiting nodes to the parent's new position.
   link.exit().transition()
      .duration(duration)
      .attr("d", function (d) {
         var o = {
            x: source.x,
            y: source.y
         };
         return diagonal({
            source: o,
            target: o
         });
      })
      .remove();

   // Stash the old positions for transition.
   nodes.forEach(function (d) {
      d.x0 = d.x;
      d.y0 = d.y;
   });

   // update icon color when data changes
   vis.selectAll("text.note-icon")
      .style("fill", function (d) {
         return d.note ? "orange" : "gray";
      });


}

// Toggle children.
function toggle(d) {
   if (d.children) {
      d._children = d.children;
      d.children = null;
   } else {
      d.children = d._children;
      d._children = null;
   }
}

// Toggle the completed flag on a node and mark project dirty
function toggleCompleted(node) {
   node.completed = !node.completed;
   currentProject.dirty = true;
}



//Togle Dark Mode
function goDark() {
   var element = document.body;
   element.classList.toggle("dark-Mode");
}

// --- NOTE PANEL (safe, defensive) ---
// var notes = JSON.parse(localStorage.getItem("nodeNotes") || "{}");
var _noteInit = false;

// function initNotePanel() {
//    if (_noteInit) return;
//    _noteInit = true;

//    // Query elements (may be null if you didn't add the HTML snippet)
//    window._notePanel = document.getElementById("note-panel");
//    window._noteTitle = document.getElementById("note-title");
//    window._noteContent = document.getElementById("note-content");
//    window._saveNoteBtn = document.getElementById("save-note");
//    window._closeNoteBtn = document.getElementById("close-note");

//    // If no panel in DOM, just return — this prevents exceptions
//    if (!window._notePanel) return;

//    // Hook save/close safely
//    if (window._saveNoteBtn) {
//       window._saveNoteBtn.addEventListener("click", function () {
//          if (window._currentNode) {
//             notes[window._currentNode.name] = window._noteContent.value;
//             localStorage.setItem("nodeNotes", JSON.stringify(notes));
//          }
//          closeNotePanel();
//       });
//    }

//    if (window._closeNoteBtn) {
//       window._closeNoteBtn.addEventListener("click", closeNotePanel);
//    }
// }

function initNotePanel() {
   if (_noteInit) return;
   _noteInit = true;

   window._notePanel = document.getElementById("note-panel");
   window._noteTitle = document.getElementById("note-title");
   window._noteContent = document.getElementById("note-content");
   window._saveNoteBtn = document.getElementById("save-note");
   window._closeNoteBtn = document.getElementById("close-note");

   if (!window._notePanel) return;

   // --- Wire up buttons safely ---
   if (window._saveNoteBtn) {
      window._saveNoteBtn.addEventListener("click", function () {
   if (window._currentNode) {
      window._currentNode.note = window._noteContent.value;
      currentProject.dirty = true;

      d3.selectAll("title").remove();
      d3.selectAll("g.node").append("title")
         .text(function (d) {
            return d.note ? d.note : (d.description || "");
         });

      d3.selectAll("text.note-icon")
         .style("fill", function (d) {
            return d.note ? "orange" : "gray";
         });
   }
   closeNotePanel();
});

   }

   if (window._closeNoteBtn) {
      window._closeNoteBtn.addEventListener("click", closeNotePanel);
   }
}


function closeNotePanel() {
   if (!window._notePanel) return;
   window._notePanel.classList.remove("visible");
}

// ----------------- Project / File utilities -----------------

async function createFixedProject() {
   try {
      const url = chrome.runtime.getURL("default.json");
      const response = await fetch(url);
      const json = await response.json();

      // Prompt user for project name
      const projectName = prompt("Enter project name:", json.name || "New Project");
      currentProject.name = projectName || (json.name || "Default Project");

      currentProject.root = json;
      currentProject.fileHandle = null;
      currentProject.dirty = true;

      root = currentProject.root;
      root.x0 = height / 2;
      root.y0 = 0;
      update(root);

      // Update page header
      setProjectTitle(currentProject.name);

      alert("Loaded default project: " + currentProject.name);
   } catch (err) {
      console.error("Error loading default project:", err);
      alert("Could not load default project.");
   }
}


function stripCircularRefs(node) {
   const copy = {
      ...node
   }; // shallow copy
   delete copy.parent; // remove circular parent reference
   if (copy.children) {
      copy.children = copy.children.map(stripCircularRefs);
   }
   if (copy._children) {
      copy._children = copy._children.map(stripCircularRefs);
   }
   return copy;
}


async function saveProjectAs() {
   const suggested = (currentProject.name || "project") + ".json";
   if (fsSupported) {
      try {
         const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{
               description: "JSON files",
               accept: {
                  "application/json": [".json"]
               }
            }]
         });
         // const writable = await handle.createWritable();
         // await writable.write(JSON.stringify(currentProject.root, null, 2));
         // Always use the current D3 root as the source of truth
         if (root) {
            currentProject.root = root;
         }

         console.log("Saving project root:", currentProject.root);

         if (root) {
            currentProject.root = root;
         }

         console.log("Saving project root:", currentProject.root);

         // Remove circular references before saving
         const saveData = stripCircularRefs(currentProject.root);

         const writable = await handle.createWritable();
         await writable.write(JSON.stringify(saveData, null, 2));
         await writable.close();

         currentProject.fileHandle = handle;
         currentProject.dirty = false;
         // optionally persist the handle in IndexedDB (see below)
         await storeHandle("lastProject", handle);
         alert("Saved to " + handle.name);
      } catch (err) {
         if (err.name !== 'AbortError') console.error(err);
      }
   } else {
      // fallback: trigger browser download
      const blob = new Blob([JSON.stringify(currentProject.root, null, 2)], {
         type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggested;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      currentProject.dirty = false;
      alert("Saved (download).");
   }
}

// Open a single JSON file (file input fallback or File System Access API)
async function openProjectFromPicker() {
   if (fsSupported && 'showOpenFilePicker' in window) {
      try {
         const [handle] = await window.showOpenFilePicker({
            types: [{
               description: "JSON",
               accept: {
                  'application/json': ['.json']
               }
            }],
            multiple: false
         });
         await loadProjectFromHandle(handle);
         // persist handle
         await storeHandle("lastProject", handle);
         return;
      } catch (err) {
         if (err.name === 'AbortError') return;
         console.error(err);
      }
   }
   // fallback: file input
   const fi = document.getElementById('file-input');
   fi.onchange = async e => {
      const f = fi.files[0];
      if (!f) return;
      const text = await f.text();
      currentProject.root = JSON.parse(text);
      root = currentProject.root;
      root.x0 = height / 2;
      root.y0 = 0;
      update(root);
      fi.value = '';
   };
   fi.click();
}

async function loadProjectFromHandle(handle) {
   try {
      const file = await handle.getFile();
      const text = await file.text();
      currentProject.root = JSON.parse(text);
      currentProject.fileHandle = handle;
      root = currentProject.root;
      root.x0 = height / 2;
      root.y0 = 0;
      update(root);
   } catch (err) {
      console.error(err);
      alert("Could not load file: " + err.message);
   }
}

// Render a small list UI (implement in DOM) and allow user to click to load
function showFileListUI(entries) {
   // simple example: create overlay with a clickable list
   let list = document.getElementById('project-list-overlay');
   if (!list) {
      list = document.createElement('div');
      list.id = 'project-list-overlay';
      list.style = 'position:fixed;left:10%;top:10%;width:80%;height:80%;background:#fff;z-index:999;overflow:auto;padding:12px;border:1px solid #ccc';
      document.body.appendChild(list);
   }
   list.innerHTML = '<button id="close-file-list">Close</button><h3>Select a project file</h3>';
   const ul = document.createElement('ul');
   entries.forEach(e => {
      const li = document.createElement('li');
      li.textContent = e.name;
      li.style.cursor = 'pointer';
      li.onclick = async () => {
         if (e.handle) {
            await loadProjectFromHandle(e.handle);
         } else if (e.fileObject) {
            const t = await e.fileObject.text();
            currentProject.root = JSON.parse(t);
            root = currentProject.root;
            root.x0 = height / 2;
            root.y0 = 0;
            update(root);
         }
         list.remove();
      };
      ul.appendChild(li);
   });
   list.appendChild(ul);
   document.getElementById('close-file-list').onclick = () => list.remove();
}


function putHandle(key, handle) {
   return new Promise((res, rej) => {
      const req = indexedDB.open('treeviewer-db', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => {
         const tx = req.result.transaction('handles', 'readwrite');
         tx.objectStore('handles').put(handle, key);
         tx.oncomplete = () => res();
         tx.onerror = () => rej(tx.error);
      };
      req.onerror = () => rej(req.error);
   });
}

function getHandle(key) {
   return new Promise((res, rej) => {
      const req = indexedDB.open('treeviewer-db', 1);
      req.onsuccess = () => {
         const tx = req.result.transaction('handles', 'readonly');
         const getReq = tx.objectStore('handles').get(key);
         getReq.onsuccess = () => res(getReq.result);
         getReq.onerror = () => rej(getReq.error);
      };
      req.onerror = () => rej(req.error);
   });
}
async function storeHandle(key, handle) {
   try {
      await putHandle(key, handle);
   } catch (e) {
      console.warn(e);
   }
}


// when opening:
function openNotePanel(d) {
   initNotePanel(); // existing safe init
   window._currentNode = d;
   if (!window._notePanel) return;
   window._noteTitle.textContent = d.name || "Note";
   window._noteContent.value = d.note || "";
   window._notePanel.classList.add("visible");
}

// when save clicked:
if (window._saveNoteBtn) {
   window._saveNoteBtn.addEventListener("click", function () {
      if (window._currentNode) {
         // Store note directly in node data
         window._currentNode.note = window._noteContent.value;

         // Mark project dirty
         currentProject.dirty = true;


         // Optionally refresh D3 titles (tooltips)
         d3.selectAll("title").remove();
         d3.selectAll("g.node").append("title")
            .text(function (d) {
               return d.note ? d.note : (d.description || "");
            });
      }


      closeNotePanel();
   });
}

function setProjectTitle(name) {
   const titleEl = document.getElementById("project-title");
   if (titleEl) {
      titleEl.textContent = name || "OSINT Framework";
   }
   // Optionally also update the browser tab title
   document.title = name ? `${name} - OSINT Framework` : "OSINT Framework";
}


// --- Toolbar button wiring ---
window.onload = function () {
   const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
      else console.warn("Button not found:", id);
   };
   bind("btn-new", createFixedProject);
   bind("btn-open", openProjectFromPicker);
   // bind("btn-open-dir", openDirectoryAndList);
   // bind("btn-save", saveProject);
   bind("btn-save-as", saveProjectAs);
   bind("btn-collapse-all", collapseAll);
   document.body.classList.add("dark-Mode");
};
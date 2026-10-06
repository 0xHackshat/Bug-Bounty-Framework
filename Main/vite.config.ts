import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function removeUnusedRawHtmlPaths() {
  let patchedReact = false
  let patchedD3 = false

  return {
    name: 'remove-unused-raw-html-paths',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const normalizedId = id.replaceAll('\\', '/')

      if (normalizedId.endsWith('/node_modules/react-dom/cjs/react-dom.production.min.js')) {
        const setter = /function\(a,b\)\{if\("http:\/\/www\.w3\.org\/2000\/svg"!==a\.namespaceURI\|\|"innerHTML"in a\)a\.innerHTML=b;else\{mb=mb\|\|document\.createElement\("div"\);mb\.innerHTML="<svg>"\+b\.valueOf\(\)\.toString\(\)\+"<\/svg>";for\(b=mb\.firstChild;a\.firstChild;\)a\.removeChild\(a\.firstChild\);for\(;b\.firstChild;\)a\.appendChild\(b\.firstChild\)\}\}/
        if (!setter.test(code)) throw new Error('React DOM raw HTML setter changed; review the security transform.')
        patchedReact = true
        return code.replace(setter, 'function(){throw Error("Raw HTML rendering is disabled in this editor") }')
      }

      if (normalizedId.endsWith('/node_modules/d3-selection/src/selection/index.js')) {
        let transformed = code.replace('import selection_html from "./html.js";\n', '')
        transformed = transformed.replace('  html: selection_html,\n', '')
        if (transformed === code) throw new Error('D3 raw HTML helper changed; review the security transform.')
        patchedD3 = true
        return transformed
      }

      return null
    },
    buildEnd() {
      if (!patchedReact || !patchedD3) throw new Error('Expected React DOM and D3 raw HTML paths were not both removed.')
    },
  }
}

export default defineConfig({ base: './', plugins: [removeUnusedRawHtmlPaths(), react()] })

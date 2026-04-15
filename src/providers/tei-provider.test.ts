import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEIProvider } from './tei-provider.js'

type FetchArgs = [input: string | URL, init?: RequestInit]

function makeFetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (...args: FetchArgs) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0].toString()
    return handler(url, args[1])
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('TEIProvider', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('embed', () => {
    it('posts to /embed with default options and returns the embedding', async () => {
      const fetchMock = makeFetchMock((url, init) => {
        expect(url).toBe('http://tei.local/embed')
        expect(init?.method).toBe('POST')
        const body = JSON.parse(init?.body as string)
        expect(body).toEqual({
          inputs: 'hello',
          truncate: true,
          truncation_direction: 'Right',
          normalize: true,
        })
        return jsonResponse([[0.1, 0.2, 0.3]])
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const result = await provider.embed('hello')

      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], model: 'tei' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('returns null when the server returns 5xx', async () => {
      globalThis.fetch = makeFetchMock(() => new Response('boom', { status: 500 })) as unknown as typeof globalThis.fetch
      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const warn = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await provider.embed('hello')

      expect(result).toBeNull()
      expect(warn).toHaveBeenCalled()
    })

    it('returns null when fetch rejects (network failure)', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof globalThis.fetch
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })

      const result = await provider.embed('hello')

      expect(result).toBeNull()
    })

    it('returns null after dispose', async () => {
      globalThis.fetch = makeFetchMock(() => jsonResponse([[1, 2]])) as unknown as typeof globalThis.fetch
      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      await provider.dispose()

      expect(await provider.embed('hello')).toBeNull()
    })

    it('forwards constructor defaults for truncation and prompt_name', async () => {
      const fetchMock = makeFetchMock((_url, init) => {
        const body = JSON.parse(init?.body as string)
        expect(body).toEqual({
          inputs: 'q',
          truncate: false,
          truncation_direction: 'Left',
          normalize: false,
          prompt_name: 'query',
        })
        return jsonResponse([[0.5]])
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({
        baseUrl: 'http://tei.local',
        truncate: false,
        truncationDirection: 'Left',
        normalize: false,
        promptName: 'query',
      })
      await provider.embed('q')
    })
  })

  describe('embedBatch', () => {
    it('sends multiple inputs in a single request and preserves order', async () => {
      const fetchMock = makeFetchMock((_url, init) => {
        const body = JSON.parse(init?.body as string)
        expect(body.inputs).toEqual(['a', 'b', 'c'])
        return jsonResponse([[1], [2], [3]])
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const results = await provider.embedBatch(['a', 'b', 'c'])

      expect(results).toHaveLength(3)
      expect(results.map((r) => r?.embedding)).toEqual([[1], [2], [3]])
    })

    it('returns empty array for empty input without calling fetch', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const results = await provider.embedBatch([])

      expect(results).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('chunks inputs exceeding maxBatchSize into multiple requests', async () => {
      const fetchMock = makeFetchMock((_url, init) => {
        const body = JSON.parse(init?.body as string) as { inputs: string[] }
        return jsonResponse(body.inputs.map((_, i) => [i]))
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local', maxBatchSize: 2 })
      const results = await provider.embedBatch(['a', 'b', 'c', 'd', 'e'])

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(results).toHaveLength(5)
      expect(results.every((r) => r !== null)).toBe(true)
    })

    it('returns null entries for a failed batch and keeps successful ones', async () => {
      let call = 0
      const fetchMock = makeFetchMock((_url, init) => {
        call++
        const body = JSON.parse(init?.body as string) as { inputs: string[] }
        if (call === 2) return new Response('429', { status: 429 })
        return jsonResponse(body.inputs.map((_, i) => [i]))
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const provider = new TEIProvider({ baseUrl: 'http://tei.local', maxBatchSize: 2 })
      const results = await provider.embedBatch(['a', 'b', 'c', 'd', 'e'])

      expect(results).toHaveLength(5)
      expect(results[0]).not.toBeNull()
      expect(results[1]).not.toBeNull()
      expect(results[2]).toBeNull()
      expect(results[3]).toBeNull()
      expect(results[4]).not.toBeNull()
    })
  })

  describe('rerank', () => {
    it('posts to /rerank and returns results mapped back to the original documents', async () => {
      const fetchMock = makeFetchMock((url, init) => {
        expect(url).toBe('http://tei.local/rerank')
        const body = JSON.parse(init?.body as string)
        expect(body).toEqual({
          query: 'what is rust',
          texts: ['title-a\ndoc a', 'doc b'],
          truncate: true,
          truncation_direction: 'Right',
          raw_scores: false,
        })
        return jsonResponse([
          { index: 1, score: 0.9 },
          { index: 0, score: 0.4 },
        ])
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const result = await provider.rerank('what is rust', [
        { file: 'a.md', text: 'doc a', title: 'title-a' },
        { file: 'b.md', text: 'doc b' },
      ])

      expect(result.model).toBe('tei')
      expect(result.results).toEqual([
        { file: 'b.md', score: 0.9, index: 1 },
        { file: 'a.md', score: 0.4, index: 0 },
      ])
    })

    it('falls back to original order on server error', async () => {
      globalThis.fetch = makeFetchMock(() => new Response('oops', { status: 500 })) as unknown as typeof globalThis.fetch
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const result = await provider.rerank('q', [
        { file: 'a.md', text: 'a' },
        { file: 'b.md', text: 'b' },
      ])

      expect(result.model).toBe('none')
      expect(result.results.map((r) => r.file)).toEqual(['a.md', 'b.md'])
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score)
    })

    it('returns empty results when given empty documents', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const result = await provider.rerank('q', [])

      expect(result.results).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('generate and expandQuery', () => {
    it('generate returns null (unsupported by TEI)', async () => {
      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      expect(await provider.generate('prompt')).toBeNull()
    })

    it('expandQuery returns default lex+vec Queryables', async () => {
      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const queries = await provider.expandQuery('rust lifetimes')
      expect(queries).toEqual([
        { type: 'lex', text: 'rust lifetimes' },
        { type: 'vec', text: 'rust lifetimes' },
      ])
    })
  })

  describe('modelExists', () => {
    it('queries /info and reports the TEI model id', async () => {
      const fetchMock = makeFetchMock((url) => {
        expect(url).toBe('http://tei.local/info')
        return jsonResponse({ model_id: 'BAAI/bge-small-en-v1.5' })
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const info = await provider.modelExists('ignored')

      expect(info).toEqual({ name: 'BAAI/bge-small-en-v1.5', exists: true })
    })

    it('reports exists=false when /info is unreachable', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('down')
      }) as unknown as typeof globalThis.fetch
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const provider = new TEIProvider({ baseUrl: 'http://tei.local' })
      const info = await provider.modelExists('BAAI/bge')

      expect(info).toEqual({ name: 'BAAI/bge', exists: false })
    })
  })

  describe('baseUrl handling', () => {
    it('trims trailing slash from baseUrl', async () => {
      const fetchMock = makeFetchMock((url) => {
        expect(url).toBe('http://tei.local/embed')
        return jsonResponse([[0]])
      })
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

      const provider = new TEIProvider({ baseUrl: 'http://tei.local/' })
      await provider.embed('hi')
    })
  })
})

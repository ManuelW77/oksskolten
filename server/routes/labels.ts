import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getLabels, getLabelById, createLabel, updateLabel, deleteLabel, getArticlesByLabel } from '../db.js'
import { requireJson } from '../auth.js'
import { NumericIdParams, parseOrBadRequest } from '../lib/validation.js'

const MatchField = z.enum(['title', 'full_text', 'both'])

const CreateLabelBody = z.object({
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required'),
  match_text: z.string({ error: 'match_text is required' }).trim().min(1, 'match_text is required'),
  match_field: MatchField.default('both'),
})

const UpdateLabelBody = z.object({
  name: z.string().trim().min(1).optional(),
  match_text: z.string().trim().min(1).optional(),
  match_field: MatchField.optional(),
  sort_order: z.number().int().optional(),
})

const LabelArticlesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function labelRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/labels', async (_request, reply) => {
    reply.send({ labels: getLabels() })
  })

  api.post(
    '/api/labels',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(CreateLabelBody, request.body, reply)
      if (!body) return
      const label = createLabel(body)
      reply.status(201).send(label)
    },
  )

  api.patch(
    '/api/labels/:id',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const body = parseOrBadRequest(UpdateLabelBody, request.body, reply)
      if (!body) return
      const label = updateLabel(params.id, body)
      if (!label) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      reply.send(label)
    },
  )

  api.delete(
    '/api/labels/:id',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const deleted = deleteLabel(params.id)
      if (!deleted) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      reply.status(204).send()
    },
  )

  api.get(
    '/api/labels/:id/articles',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      if (!getLabelById(params.id)) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      const query = parseOrBadRequest(LabelArticlesQuery, request.query, reply)
      if (!query) return
      const result = getArticlesByLabel(params.id, { limit: query.limit, offset: query.offset })
      reply.send({
        articles: result.items,
        total: result.total,
        has_more: result.items.length + query.offset < result.total,
      })
    },
  )
}

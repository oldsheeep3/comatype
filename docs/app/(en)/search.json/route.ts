// Search index (English). Built once at build time and written out as a static search.json.
import { searchIndex } from '../../../lib/search-index'

export const dynamic = 'force-static'

export async function GET() {
  return Response.json(await searchIndex('en'))
}

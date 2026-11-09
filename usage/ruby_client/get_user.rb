require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# GET /user/:id (pass params and search as hashes keyed by attribute name)
def get_user(id, verbose: nil)
  Comatype::C.get(GetUser::ENDPOINT, params: { id: id }, search: { verbose: verbose })
end

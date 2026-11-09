require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# GET /user?limit= (user/get.comat. A file named only after the method points at the directory itself, /user)
def list_users(limit: nil)
  Comatype::C.get(UserGet::ENDPOINT, search: { limit: limit })
end

require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

# DELETE /user/:id
def delete_user(id)
  Comatype::C.delete(UserDeleteId::ENDPOINT, params: { id: id })
end

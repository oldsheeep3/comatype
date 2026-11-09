require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_user_delete_id(server)
  server.delete(UserDeleteId::ENDPOINT) do |req|
    next UserDeleteId::S404.new(Types::ApiError.new(code: "not_found", message: "user not found")) unless Db::User.delete(req.params.id)

    UserDeleteId::S204.new
  end
end

require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_user_get(server)
  server.get(UserGet::ENDPOINT) do |req|
    # req.search.limit: Integer / nil
    UserGet::S200.new(Db::User.list(req.search.limit))
  end
end

require "comatype"
require_relative "comatype_gen/all"

include ComatypeGen

def register_get_user(server)
  server.get(GetUser::ENDPOINT) do |req|
    # req.params.id: String, req.search.verbose: true / false / nil
    user = Db::User.find(req.params.id) # the app's own storage
    next GetUser::S404.new(Types::ApiError.new(code: "not_found", message: "user not found")) unless user

    GetUser::S200.new(user)
  end
end

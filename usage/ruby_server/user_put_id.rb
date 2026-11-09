require "comatype"
require_relative "comatype_gen/all"

UserPutId = ComatypeGen::UserPutId

def register_user_put_id(server)
  server.put(UserPutId::ENDPOINT) do |req|
    # req.params.id: String, req.body: UserData, req.ctx[:auth].user (wrap auth is on)
    user = Db::User.update(req.params.id, req.body) # the app's own storage
    next UserPutId::S404.new(ComatypeGen::Types::ApiError.new(code: "not_found", message: "user not found")) unless user

    # headerRes (X-Resource-Version) of user/defaults.comat
    UserPutId::S200.new(user, headers: { x_resource_version: "v2" })
  end
end

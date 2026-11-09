require "comatype"
require_relative "comatype_gen/all"

UserPutId = ComatypeGen::UserPutId

def put_user(id, user)
  # Arguments are params: search: headers: body: (a Model, or a hash keyed by attr). Types are validated from params / body of put__id.comat
  res = Comatype::C.put(UserPutId::ENDPOINT, params: { id: id }, body: user)

  case res
  when UserPutId::S200 then res.body # UserData (res.headers is S200Headers)
  when UserPutId::S404 then res.body # ApiError
  end
end

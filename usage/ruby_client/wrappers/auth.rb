# A wrapper is implemented as a lambda taking (req, nxt) (corresponds to the `wrapper auth` of init.comat)
AUTH = lambda do |req, nxt|
  req.headers["Authorization"] = "Bearer #{ENV['API_TOKEN']}"
  nxt.call(req)
end

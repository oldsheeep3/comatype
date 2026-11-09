# frozen_string_literal: true

# Comatype's Ruby runtime. Runs on the standard library only (json, net/http, bigdecimal, uri, date, time, base64, socket).
#   Comatype::C  client (C.get(ENDPOINT, params: {...}, body: ...))
#   Comatype::S  server (Rack compatible. S.new.get(ENDPOINT) { |req| ... })
require "json"
require "date"
require "time"
require "uri"
require "bigdecimal"
require "base64"
require "net/http"
require "socket"

require_relative "comatype/errors"
require_relative "comatype/raw"
require_relative "comatype/check"
require_relative "comatype/cache"
require_relative "comatype/codec"
require_relative "comatype/model"
require_relative "comatype/wire"
require_relative "comatype/cookie"
require_relative "comatype/response"
require_relative "comatype/endpoint"
require_relative "comatype/c"
require_relative "comatype/s"

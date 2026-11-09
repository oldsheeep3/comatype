package main

// Server init file: import and pass the implemented ComatypeWrap
// The cookie settings (name, httpOnly, etc.) are in init.comat
import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	"example.com/app/wrappers"
	// Package generated from init.comat
	comatype_init "example.com/app/comatype/init"
)

func InitComatype() {
	s.Init(s.Config{
		// With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
		Wrappers: comatype_init.Wrappers{Auth: wrappers.Auth},
	})
}

package s

import (
	"errors"

	"github.com/oldsheeep3/comatype/packages/go/comatype"
)

func asValidation(err error, target **comatype.ValidationError) bool { return errors.As(err, target) }

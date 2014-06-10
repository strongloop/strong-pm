This test app has a production dependency on a compiled addon, and a dev
dependency.

It can be used to demonstrate addons are not compiled before push, but are
compiled during preparation, and that dev dependencies are not pushed, or
installed during preparation.

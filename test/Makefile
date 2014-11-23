default: container/strong-pm.tgz strong-pm.tgz

npm_config_registry ?= $(shell npm config get registry)

container/Dockerfile: Dockerfile.in
	mkdir -p container
	sed -e "s%NPM_CONFIG_REGISTRY%${npm_config_registry}%" $^ > $@

container/strong-pm.tgz: strong-pm.tgz
	mkdir -p container
	cp $< $@

strong-pm.tgz: $(shell git ls-files ../bin ../lib ../package.json)
	cp $(shell npm pack ..) $@

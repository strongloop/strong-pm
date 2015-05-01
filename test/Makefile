default: container/Dockerfile container/strong-pm.tgz strong-pm.tgz

npm_config_registry ?= $(shell npm config get registry)
node_image ?= $(notdir $(shell node -p process.execPath))
node_version ?= $(subst v,,$(shell node -p process.version))

container/Dockerfile: Dockerfile.in Makefile
	mkdir -p container
	cat $< \
		| sed -e "s%NODE_IMAGE%${node_image}%" \
		| sed -e "s%NODE_VERSION%${node_version}%" \
		| sed -e "s%NPM_CONFIG_REGISTRY%${npm_config_registry}%" \
	> $@

container/strong-pm.tgz: strong-pm.tgz
	mkdir -p container
	cp $< $@

strong-pm.tgz: $(shell git ls-files ../bin ../lib ../package.json)
	cp $(shell npm pack ..) $@

default: container/strong-pm.tgz strong-pm.tgz

container/strong-pm.tgz: strong-pm.tgz
	@cp $< $@

strong-pm.tgz: $(shell git ls-files ../bin ../lib ../package.json)
	@cp $(shell npm pack ..) $@

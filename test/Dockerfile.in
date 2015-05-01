FROM NODE_IMAGE:NODE_VERSION

# Create "strongloop" user
RUN useradd -ms /bin/bash strongloop \
    && chown -R strongloop /usr/local

# Set up some semblance of an environment
WORKDIR /home/strongloop
ENV HOME /home/strongloop
USER strongloop

# actual work..
COPY strong-pm.tgz /home/strongloop/
RUN npm install --registry NPM_CONFIG_REGISTRY --global strong-pm.tgz

ENTRYPOINT ["/usr/local/bin/sl-pm"]

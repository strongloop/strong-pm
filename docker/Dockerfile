FROM nodesource/node

# Ensure git is installed (used by strong-pm)
# Create "strong-pm" user
RUN apt-get install -yq git && apt-get clean \
    && npm install --unsafe-perm --global strongloop/strong-pm#production \
    && npm cache clean \
    && useradd -ms /bin/bash strong-pm

# Set up some semblance of an environment
WORKDIR /home/strong-pm
ENV HOME /home/strong-pm

# Run as non-privileged user inside container
USER strong-pm

# pre-load node-gyp to speed up build time of apps pushed to strong-pm
RUN node-gyp install 2> /dev/null && npm cache clear

# Expose strong-pm port
EXPOSE 7000

ENTRYPOINT ["/usr/bin/sl-pm", "--listen", "7000"]

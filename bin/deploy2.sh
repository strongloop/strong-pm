set -e
set -x
tar -tzf ../express-example-app-1.0.0.tgz
ls -l ../express-example-app-1.0.0.tgz
curl --progress -X PUT \
  --upload-file ../express-example-app-1.0.0.tgz \
  http://localhost:8701/api/Services/2/deploy

# --data-binary
# --upload-file

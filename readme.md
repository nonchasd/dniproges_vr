to compile protobuf protos to ts

- install ts-proto (protobuf to typescript compiler plugin)
```bash
npm i ts-proto
```

- run the protobuf compiler with the ts-proto plugin
```bash
<PROTOBUF_COMPILER> --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out ./proto/ts -I ./proto/msgs ./proto/msgs/*.proto
```

### to run the app
```bash
npm run dev
```

### to build for production
```bash
npm run build
```
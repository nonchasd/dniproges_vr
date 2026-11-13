declare module "*.glb" {
  const value: string;
  export default value;
}

declare module "*.gltf" {
  const value: string;
  export default value;
}

declare const process: {
  env: {
    NODE_ENV: string;
    [key: string]: string | undefined;
  };
};

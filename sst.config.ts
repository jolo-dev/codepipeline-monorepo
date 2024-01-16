import { SSTConfig } from "sst";
import { BackendStack } from "./stacks/BackendStack";
import { SinglePipelineStack } from './stacks/PipelineStack/SinglePipelineStack';
import { FrontendStack } from './stacks/FrontendStack';
import { MultiPipelineStack } from './stacks/PipelineStack/MultiPipelineStack';

export default {
  config(_input) {
    return {
      name: "aws-ug-codepipeline-demo",
      region: "eu-central-1",
    };
  },
  stacks(app) {
    switch (process.env.PURPOSE) {
      case "single-pipeline":
        app.stack(SinglePipelineStack);
        break;
      case "multi-pipeline":
        app.stack(MultiPipelineStack);
        break;
      case "backend":
        app.stack(BackendStack);
        break;
      case "frontend":
        app.stack(FrontendStack);
        break;
      default:
        throw new Error("PURPOSE environment variable is not set");  
    }
  }
} satisfies SSTConfig;

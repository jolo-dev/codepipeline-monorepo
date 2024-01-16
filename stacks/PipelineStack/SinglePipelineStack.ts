import { Pipeline, Artifact } from "aws-cdk-lib/aws-codepipeline";
import {
	CodeBuildAction,
	CodeCommitSourceAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import { Repository } from "aws-cdk-lib/aws-codecommit";
import { StackContext } from "sst/constructs";
import { BuildSpec, PipelineProject } from "aws-cdk-lib/aws-codebuild";

export function SinglePipelineStack({ stack }: StackContext) {
	// 0. Stage: CodePipeline (Pre-Requisite)
	// 0.1 Create the pipeline
	const pipeline = new Pipeline(stack, "Pipeline", {
		pipelineName: "aws-cdk-pipeline-demo",
		// This allows the pipeline to create resources in other accounts and is encrypted (Best Practice)
		crossAccountKeys: true,
	});
	// 0.2 Create the artifact to store outputs of the pipeline
	const artifact = new Artifact();
	// 1. Stage : CodeCommit
	// 1.1. Create the repository
	const repository = new Repository(stack, "Repository", {
		repositoryName: "aws-cdk-pipeline-demo",
	});
	// But it's best practice to deploy the repository in a separate (stateful) stack
	// Meaning you should import it here
	// 1.1. Import the repository
	// const repository = Repository.fromRepositoryName(stack, "Repository", "aws-cdk-pipeline-demo");
	// 1.2. Add the source action to the pipeline
	pipeline.addStage({
		stageName: "Source",
		actions: [
			new CodeCommitSourceAction({
				actionName: "Source",
				output: artifact,
				repository,
				branch: "main",
			}),
		],
	});
	// 2. Stage : CodeBuild
	// 2.1. Create the build project
	pipeline.addStage({
		stageName: "Build",
		// We can actually paste many actions in here
		// But since we can dump anything in one CodeBuild
		actions: [
			new CodeBuildAction({
				actionName: "Build",
				input: artifact,
				project: new PipelineProject(stack, "BuildProject", {
					projectName: "aws-cdk-build-project-demo",
					// You can also create your own buildspec.yml file and reference it here instead of using the inline buildspec
					// https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec-ref-syntax
					buildSpec: BuildSpec.fromObject({
						version: "0.2",
						phases: {
							install: {
								commands: ["npm install"],
							},
							build: {
								commands: [
									"npm run lint",
									"npm run test:unit",
									"npm run build",
									"npm run deploy",
									"npm run test:integration",
								],
							},
						},
						artifacts: {
							"base-directory": ".",
							files: ["**/*"],
						},
					}),
				}),
			}),
		],
	});
	// 3. Stage : What about CodeDeploy?
	// CodeDeploy is a service as the name suggest deploys to EC2, ECS, S3 and Lambda.
	// However, ..
}

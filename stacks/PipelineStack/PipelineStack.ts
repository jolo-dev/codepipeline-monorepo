// biome-ignore lint/suspicious/noShadowRestrictedNames: It is the name of the SST construct.
import { Function, Stack, type StackProps } from 'sst/constructs';
import type { Construct } from 'constructs';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import type { Action } from 'aws-cdk-lib/aws-codepipeline-actions';
import { CodeBuildAction, CodeCommitSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import {
  BuildSpec,
  ComputeType,
  LinuxBuildImage,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

export interface Account {
  stage: string;
  number: string;
  region: string; // or to narrow it:  "eu-central-1" | "us-east-1"
}

interface Command {
  preBuild?: string[];
  install?: string[];
  build?: string[];
  postBuild?: string[];
}

export type PipelineStackProps = StackProps &
  Command & {
    accounts: Account[];
    branch?: string;
  };

/**
 * Abstract Class for building multiple Pipelines
 * Make it abstract to give the Pipeline a base
 */
export abstract class PipelineStack extends Stack {
  public readonly pipeline: Pipeline;
  public readonly artifact: Artifact;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // 0. Stage: CodePipeline (Pre-Requisite)
    // 0.1 Create the pipeline
    this.pipeline = new Pipeline(this, 'Pipeline', {
      pipelineName: id,
    });

    // 0.2 Create the artifact to store outputs of the pipeline
    this.artifact = new Artifact('SourceArtifact');

    // 1. Stage : CodeCommit
    // We are importing the repository because it's a stateful resource
    // and should be deployed in a stateful stack
    const repository = Repository.fromRepositoryName(this, 'Repository', 'aws-cdk-pipeline-demo');

    // 1.2. Add the source action to the pipeline
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new CodeCommitSourceAction({
          actionName: 'Source',
          output: this.artifact,
          repository,
          branch: props.branch ?? 'main',
        }),
      ],
    });
    // 2. Stage: CodeBuild
    // 2.1. Build Stage
    this.pipeline.addStage({
      stageName: 'Build',
      // We can actually paste many actions in here
      // But since we can dump anything in one CodeBuild
      actions: [
        new CodeBuildAction({
          actionName: 'Build',
          input: this.artifact,
          project: new PipelineProject(this, 'BuildProject', {
            projectName: 'aws-cdk-build-project-demo',
            // You can also create your own buildspec.yml file and reference it here instead of using the inline buildspec
            // https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec-ref-syntax
            buildSpec: BuildSpec.fromObject({
              version: '0.2',
              phases: {
                install: {
                  commands: ['npm install'],
                },
                build: {
                  commands: ['npm run lint', 'npm run test:unit', 'npm run build'],
                },
              },
              artifacts: {
                'base-directory': 'dist',
                files: ['**/*'],
              },
            }),
          }),
        }),
      ],
    });

    // 2.2. Deploy Stage
    // This part is now handled in the Concrete class which inherits this
    // However, we can simplify the inheritance and provide helper functions below
    // createPipelineProject(), addPoliciesToProject(), addStageToPipeline(), createPipelineProject(), addStageToPipeline()

    // MultiPipelineStack: Lambda to trigger the correct Pipeline
    // Because it's event-based, we need to understand the event pattern.
    const eventPattern = {
      'detail-type': ['CodeCommit Repository State Change'],
      resources: [repository.repositoryArn],
      source: ['aws.codecommit'],
      detail: {
        referenceType: ['branch'],
        event: ['referenceCreated', 'referenceUpdated'],
        referenceName: [props.branch ?? 'main'],
      },
    };

    // Policy for the Lambda
    const initialPolicy = [
      new PolicyStatement({
        actions: ['codecommit:GetDifferences'],
        resources: [repository.repositoryArn],
      }),
      new PolicyStatement({
        actions: ['codepipeline:StartPipelineExecution'],
        resources: [`arn:aws:codepipeline:${this.region}:${this.account}:*`],
      }),
    ];

    const customLambdaPipelineTrigger =
      // We need to check if the function already exists
      // Otherwise whenever we create a new pipeline it would create a new Lambda but we only need one
      Function.fromFunctionName(
        this,
        'CustomLambdaPipelineTrigger',
        'customLambdaPipelineTrigger',
      ) ??
      new Function(this, 'CustomLambdaPipelineTrigger', {
        handler: 'packages/core/src/customLambdaPipelineTrigger.handler',
        description: 'Trigger the pipeline when a commit is pushed to the master branch',
        functionName: 'customLambdaPipelineTrigger',
        initialPolicy,
      });

    // This emits an event and will halt before the pipeline is triggered
    this.pipeline.onEvent('EventTrigger', {
      eventPattern,
      description: 'Trigger the pipeline when a commit is pushed to the branch',
      target: new LambdaFunction(customLambdaPipelineTrigger),
    });
  }

  /**
   * The function creates a pipeline project with specified commands and build specifications.
   * @param {Construct} scope - The scope parameter is the parent construct that the pipeline project
   * will be created under. It defines the scope or context in which the project will exist.
   * @param {string} name - The name of the pipeline project. It is used as the project name and also as
   * the name of the construct in the AWS CDK.
   * @param {Command} commands - The `commands` parameter is an object that contains the commands to be
   * executed in different phases of the build process. It has the following structure:
   * @returns a new instance of the `PipelineProject` class.
   */
  public createPipelineProject(scope: Construct, name: string, commands: Command): PipelineProject {
    return new PipelineProject(scope, name, {
      projectName: name,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.LARGE,
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: commands.preBuild,
          },
          install: {
            commands: commands.install,
          },
          build: {
            commands: commands.build,
          },
          post_build: {
            commands: commands.postBuild,
          },
        },
        artifacts: {
          'base-directory': '.',
          files: ['**/*'],
        },
      }),
    });
  }

  /**
   * The function `addPoliciesToProject` adds policy statements to a given `PipelineProject` object to
   * grant permissions for various AWS actions and resources.
   * @param {PipelineProject} project - The `project` parameter is of type `PipelineProject`, which
   * represents a pipeline project in AWS CodePipeline.
   * @param {Account[]} accounts - The `accounts` parameter is an array of `Account` objects. Each
   * `Account` object represents an AWS account and contains the following properties:
   */
  public addPoliciesToProject(project: PipelineProject, accounts: Account[]): void {
    project.addToRolePolicy(
      new PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          ...accounts.map(
            (account) =>
              `arn:aws:cloudformation:${account.region}:${account.number}:stack/SSTBootstrap/*`,
          ),
          ...accounts.map(
            (account) =>
              `arn:aws:cloudformation:${account.region}:${account.number}:stack/CDKToolkit/*`,
          ),
        ],
      }),
    );

    project.addToRolePolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          ...accounts.map((account) => `arn:aws:iam::${account.number}:role/SSTCodebuild`),
          ...accounts.map(
            (account) => `arn:aws:iam::${account.number}:role/check-dynamodb-tables-role`,
          ),
        ],
      }),
    );
  }

  /**
   * The function adds a stage to a pipeline with a given stage name and a list of actions.
   * @param {string} stageName - A string representing the name of the stage to be added to the
   * pipeline.
   * @param {Action[]} actions - The `actions` parameter is an array of `Action` objects. Each `Action`
   * object represents a specific action or task that needs to be performed in the pipeline stage.
   */
  public addStageToPipeline(stageName: string, actions: Action[]): void {
    this.pipeline.addStage({
      stageName,
      actions,
    });
  }
}

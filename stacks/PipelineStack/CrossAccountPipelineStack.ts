import { Construct } from 'constructs';
import { PipelineStack, PipelineStackProps } from './PipelineStack';
import { CodeBuildAction, ManualApprovalAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { accounts } from './accounts';

type CrossAccountPipelineStackProps = PipelineStackProps & {
  purpose: string;
};

export class CrossAccountPipelineStack extends PipelineStack {
  constructor(scope: Construct, id: string, props: CrossAccountPipelineStackProps) {
    super(scope, id, props);

    for (const account of accounts) {
      // Create CodeBuild Project
      const deploy = this.createPipelineProject(this, `DeployTo${account.stage}`, {
        install: ['./scripts/assume-role.sh'],
        build: [`PURPOSE=${props.purpose} npx sst deploy --stage ${account.stage}`],
        postBuild: ['npm run test:integration'],
      });

      // Create Action for Codepipeline
      const actions = [
        new CodeBuildAction({
          actionName: `Deploy-${account.stage.toUpperCase()}`,
          input: this.artifact,
          project: deploy,
          runOrder: 2,
        }),
      ];

      // Add Action to Pipeline
      this.addStageToPipeline(
        `Deploy-${account.stage.toUpperCase()}`,
        account.stage !== 'dev'
          ? [
              new ManualApprovalAction({
                actionName: 'ManualApproval',
                additionalInformation: `Review Before Deploy ${account.stage}`,
                runOrder: 1,
              }),
              ...actions,
            ]
          : actions,
      );
    }
  }
}

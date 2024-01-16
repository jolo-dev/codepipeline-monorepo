import { NextjsSite, StackContext } from "sst/constructs";

export function FrontendStack({ stack }: StackContext) {
	const site = new NextjsSite(stack, "site", {
		path: "packages/frontend",
	});
	stack.addOutputs({
		SiteUrl: site.url,
	});
}

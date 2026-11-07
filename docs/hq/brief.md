<!-- The owner's LifeFlow HQ prompt, saved word for word on 2026-11-06 (HQ setup chat). Everything below this line is the owner's text, unchanged. -->

Before doing anything, save this prompt word for word to docs/hq/brief.md, read docs/team.md, CLAUDE.md, docs/vision.md (section 15) and the cost and awake rules, then show me a short plan for my yes. Don’t start any agents until I say goodnight.

LIFEFLOW HQ — FINAL MASTER PROMPT
The vision
You already built LifeFlow and understand my application, existing development conversations, marketing workflows, and current architecture.
I want you to build LifeFlow HQ, a simple, beautiful, functional headquarters for managing my startup.
Imagine a small, cozy startup office with a handful of cute AI employees.
Each employee has a little workspace, their own responsibilities, and a direct connection to the work they actually perform.
I should be able to open HQ, see my team, click on an employee, continue working with them, give instructions, review completed work, and manage the company.
This must be a genuinely useful business workspace, not just an animated dashboard.
The design should be simple, premium, warm, charming, and consistent with LifeFlow's branding.
Do not overengineer the experience.
1. PRESERVE MY EXISTING CONVERSATIONS
I already have four established Claude Code conversations:
LF Main
My original development conversation responsible for the current version of LifeFlow.
LF V3
My development conversation for Version 3, including the redesigned timeline, new concepts, and future improvements.
LF V3 uses a separate branch and has not been merged into the current application.
LF V3 — Agents
An existing subchat containing the agent workflows and automation work.
LF Marketing
My existing creative and marketing conversation containing campaigns, prompts, videos, Higgsfield workflows, ElevenLabs work, and social media content.
These conversations are the foundation of HQ.
Do not recreate them as new chatbots or discard their history.
Investigate how to discover, display, and resume their actual Claude Code sessions through supported methods.
Preserve:

* Original conversation histories.
* Session identity.
* Development context.
* Existing instructions.
* Associated Git branches and worktrees.
* Relevant files.
* Current work and prior decisions.

If direct continuation inside HQ is supported, implement it securely.
If it is not supported, create a convenient conversation organizer that opens the real Claude Code sessions and displays available information without pretending to reproduce their functionality.
Do not bypass subscription authentication restrictions or silently switch sessions to paid API usage.
Never merge LF V3 into the current app without my approval.
2. THE FIVE SIMPLE HQ EMPLOYEES
Create five small, cute characters.
They represent functional roles, but they do not each require a continuously running AI model.
Employee 1 — Developer
Connected primarily to LF Main.
Responsibilities:

* Maintain the current app.
* Fix bugs.
* Improve performance.
* Debug integrations.
* Run tests.
* Review code quality.
* Protect application reliability.

Employee 2 — Designer / V3 Builder
Connected primarily to LF V3.
Responsibilities:

* Develop LifeFlow V3.
* Explore and improve the timeline.
* Refine user experience.
* Work on new features and concepts.
* Preserve V3's independent development environment.

Employee 3 — Researcher / Agent Operations
Connected primarily to LF V3 — Agents.
Responsibilities:

* Research competing products.
* Investigate new technology and integrations.
* Analyze competitor complaints.
* Audit functionality.
* Coordinate appropriate automated tests.
* Find product improvement opportunities.
* Maintain an evidence-based backlog.

This role can invoke specialized engineering, quality, or research tools when necessary.
Employee 4 — Marketing & Growth
Connected primarily to LF Marketing.
Responsibilities:

* Marketing strategy.
* Social media content.
* Video concepts and scripts.
* Trend research.
* Competitor campaign research.
* Creative production workflows.
* Post scheduling.
* Marketing analytics.
* Comments and inbound DMs.
* Customer feedback.
* Legitimate customer acquisition opportunities.

Use specialist tools for publishing, community work, and analytics rather than creating three additional permanent AI agents.
Employee 5 — HQ Assistant
The small office coordinator.
Responsibilities:

* Help me communicate with the team.
* Create and assign tasks.
* Keep work organized.
* Summarize progress.
* Notify me about approvals.
* Monitor important deadlines.
* Bring together research and results.
* Prepare weekly founder summaries.

This role should use lightweight orchestration and ordinary application logic wherever possible.
Do not launch an expensive AI session merely to update a task status.
Important
These five employees are the visual interface.
Underneath, use the smallest number of AI workers necessary.
Share model execution, research tools, and business services when it saves resources.
Do not create duplicate systems or unnecessary agents.
3. THE VISUAL HEADQUARTERS
Build one small, coherent office scene.
Think of a cozy miniature startup workplace, not a large corporate building or complex simulation game.
Design

* LifeFlow's existing eucalyptus-green identity.
* Premium dark and light modes.
* Warm desk lamps and soft shadows.
* Small desks and monitors.
* Plants, books, mugs, and personal accessories.
* Cute but polished employee characters.
* Subtle office details.
* Clean, readable information panels.
* Lightweight 2D or 2.5D visuals.

Use the original approved HQ concept as inspiration, but simplify its implementation.
Avoid heavyweight 3D rendering, expensive animation systems, or anything that slows down the application.
Employee behavior
Working: Sitting at their desk doing a simple recognizable action appropriate to their actual job.
Sleeping: Resting in a tiny bed, on a couch, or at a comfortable resting area with a subtle Zzz animation.
Needs me: A small notification indicator appears.
Completed: A subtle success indicator appears.
Blocked: Display a clear warning and reason.
Offline: Clearly indicate when the session or service is unavailable.
Animations should be lightweight and entirely independent of AI inference.
Do not fabricate real work activity.
Clicking an employee
Open their individual workspace showing:

* Their connected Claude conversation.
* Current work.
* Recent activity.
* Completed tasks.
* Pending tasks.
* Results and relevant links.
* Things requiring my approval.
* A way to communicate with them through the supported conversation interface.

Keep the workspace comfortable for reading, coding discussions, reviewing content, and managing work.
I do not need an animated character on screen while reading long conversations.
Two viewing modes
Office View: Cute characters, desks, current statuses, and quick access.
Workspace View: Practical chats, tasks, approvals, files, schedules, and reports.
Let me switch between them instantly.
Both views must share the same real information.
4. HQ MANAGEMENT FEATURES
Keep the interface focused.
Create:
Conversations
Access my existing Claude Code conversations, grouped by their real roles.
Missions
A task board with real statuses, priorities, ownership, progress, and completed results.
Approval Inbox
One place where I review proposed changes, content, publishing, important messages, and other decisions.
Marketing
Content calendar, research, campaigns, assets, and performance.
Reports
Product improvements, research, analytics, and weekly summaries.
Founder Office
Direct access to my existing admin dashboard.
Settings
Integrations, permissions, usage controls, and automation configuration.
Do not create empty decorative pages.
Every control must work or clearly indicate that its functionality has not been connected yet.
5. INTEGRATE THE EXISTING ADMIN PANEL
LifeFlow already has an administrative panel accessible from my phone.
Reuse that implementation.
Do not rebuild the admin backend or create duplicate user-management systems.
Make the existing panel accessible from HQ, including on desktop and mobile.
Maintain founder-only authorization and secure backend permissions.
Preserve all current admin functionality.
Allow modular future expansion for:

* Users and accounts.
* Signups and activation.
* Product performance.
* Integration health.
* AI usage.
* Marketing analytics.
* Customer feedback.
* Operational costs.
* Agent activity.
* Security and audit logs.

Only implement new sections when they have useful actual data.
6. AUTOMATED PRODUCT IMPROVEMENT
Use an efficient engineering workflow.
Suggested weekly routine:
Sunday: Targeted audit and regression tests.
Tuesday: Fix the highest-priority confirmed problems.
Thursday: Product research, integration health, and selected improvements.
Prioritize:

1. Security and data integrity.
2. Crashes and broken functionality.
3. Financial data accuracy and Plaid.
4. Personal assistant reliability.
5. Important external integrations.
6. Performance.
7. User experience.
8. Minor UI improvements.

Do not force a fixed number of fixes.
One meaningful improvement is better than several unnecessary changes.
Use deterministic testing before expensive AI reviews.
Make focused changes on appropriate branches.
Do not merge V3 or deploy sensitive changes without my approval.
7. EXTERNAL RESEARCH
I want LifeFlow to continuously learn from relevant developments outside our project.
Research:

* Competing AI assistants.
* Finance and budgeting apps.
* Productivity and calendar applications.
* Student organization tools.
* Relevant developer technology.
* New integration opportunities.
* Important design trends.
* Genuine customer complaints.

Maintain sourced findings containing:

* The discovery.
* Source link and date.
* User problem.
* Relevance to LifeFlow.
* Suggested improvement.
* Potential value.
* Effort and risk.

Reuse previous findings instead of researching the same topics every time.
Share useful insights with LF Main, LF V3, and Marketing through concise structured records.
Major features and design changes require my approval.
8. MARKETING OPERATIONS
The Marketing employee should function like a capable startup CMO, supported by specialist tools.
Research
Study current relevant social trends, competitor campaigns, short-form video concepts, successful hooks, and audience problems.
Use real references, dates, and available evidence.
Do not fabricate engagement numbers or copy protected competitor material.
Content
Develop approximately three strong short-form content concepts weekly at first.
Use LifeFlow's established brand and actual product capabilities.
Create:

* Hooks.
* Scripts.
* Storyboards.
* Visual concepts.
* Captions.
* Calls to action.
* Platform-specific adaptations.

Reuse supported Higgsfield, ElevenLabs, and existing production workflows.
Do not pretend that a script is a finished video.
Social connections
Investigate authorized integrations for Instagram, TikTok, YouTube, Facebook, and LinkedIn.
Prefer existing connected accounts, official APIs, and reputable scheduling services.
Create a content calendar and publishing workflow.
Initially, require my approval before publishing.
Enable limited automated publishing only after functionality is verified and I explicitly approve the relevant categories and rules.
Comments and DMs
Monitor authorized incoming interactions where platform access permits.
Prepare short, natural responses to routine product questions.
After permission is granted, allow automatic responses only within narrow, low-risk, platform-permitted boundaries.
Escalate complaints, partnership opportunities, sensitive issues, and unusual questions.
Never impersonate me or send unsolicited bulk promotional messages.
Analytics
Track available real metrics:

* Views and reach.
* Engagement.
* Follower growth.
* Watch time.
* Website visits.
* Signups.
* Activation.
* Conversion.
* Content performance.

Use the results to improve future marketing.
Focus on customer acquisition and product value, not vanity metrics.
Competitor complaints and growth
Research genuine negative reviews and relevant public complaints about competing products.
Identify repeated problems.
Use findings to:

* Improve LifeFlow.
* Develop honest marketing messages.
* Identify relevant market opportunities.
* Find permitted public conversations where people explicitly seek alternatives.

Do not scrape private contact information, identify anonymous reviewers, or automatically contact negative reviewers.
Prepare legitimate outreach opportunities for my review.
Initial outbound promotional contact requires my approval.
9. COST MANAGEMENT
I have the Claude Max $100 subscription.
The entire autonomous workflow should target approximately 35–40% of my actual weekly usage allowance.
The maximum authorized allocation is 50%.
Suggested planning allocation:

* Engineering and product research: 25%.
* Marketing and growth: 15%.
* Reserve: 10%.

Verify whether subscription-level weekly usage can actually be measured and enforced through supported interfaces.
If a reliable hard cap cannot be implemented, do not claim one exists.
Require fresh usage confirmation or my approval before unattended Claude-intensive scheduling when necessary.
Do not enable additional API charges or paid overages automatically.
Check any eligible included Claude API credits separately, but do not assume they can replace Claude Code subscription access.
Use:

* Cached research.
* Concise project memory.
* Targeted repository inspection.
* Deterministic scripts.
* Event-based automation.
* Lightweight model selection.
* Minimal concurrent workers.
* Ordinary frontend animations.

Do not spend AI resources animating employees, displaying dashboards, or keeping the office visually active.
Do not purchase extra subscriptions without my permission.
10. SECURITY AND APPROVALS
HQ is private and founder-only.
Protect:

* Existing Claude sessions.
* Repository access.
* API credentials.
* Social account credentials.
* Customer information.
* Administrative operations.

Do not expose sensitive tools or data to ordinary LifeFlow users.
Automatically allowed work includes read-only research, safe testing, drafts, reports, and isolated low-risk development changes.
Require appropriate approval before:

* Production deployment.
* V3 merges.
* Major feature development.
* Important design changes.
* Publishing unapproved content.
* Outbound marketing messages.
* Paid advertising.
* Extra subscriptions.
* Destructive operations.
* Sensitive data or security changes.

Maintain actual task records and action logs.
11. BUILD IT IN PHASES
Phase 0 — Inspect and plan
Before making major changes:

1. Inspect the existing repository.
2. Locate the four original Claude conversations.
3. Verify actual history and continuation capabilities.
4. Identify the existing admin implementation.
5. Inspect current agents and automations.
6. Review current infrastructure and costs.
7. Determine the simplest safe architecture.
8. Identify any unsupported requirements.

Present a concise architecture and implementation plan for approval.
Do not assume the existing four chats can automatically be embedded in a custom website.
Phase 1 — Simple functional HQ
After approval, implement:

* Small cozy office.
* Five simple employee characters.
* Sleeping, working, blocked, and approval states.
* Existing conversation access.
* Practical workspace view.
* Real task system.
* Founder approval inbox.
* Existing admin integration.
* Responsive desktop and mobile access.

This phase should produce a useful working headquarters, not just a visual mockup.
Phase 2 — Engineering and research
Connect the existing engineering and research workflows to HQ.
Demonstrate one real, verified development or testing task and show its results in the interface.
Phase 3 — Marketing
Integrate LF Marketing, research, content planning, assets, and available analytics.
Demonstrate one complete research-to-content-draft workflow.
Phase 4 — Approved social automation
Connect authorized publishing and messaging tools.
Implement scheduling, analytics, approval controls, and permitted routine engagement.
Do not enable unattended posting before I authorize it.
Phase 5 — Optimization
Improve efficiency, reporting, cross-department coordination, and useful automation based on observed results.
Add complexity only when justified.
12. DEFINITION OF SUCCESS
I open LifeFlow HQ.
I see a cute, cozy little office.
My Developer is at his computer working on a real task.
My V3 Designer is working on future concepts.
My Researcher is investigating something useful.
My Marketer is preparing new content.
My HQ Assistant tells me what needs attention.
If an employee isn't working, they're sleeping or resting.
I click any employee and can access the relevant existing conversation and work.
I can review tasks, approve actions, access admin, and understand what the team accomplished.
Everything is responsive and works from my phone.
The HQ doesn't consume AI credits simply because it's open.
My original conversations and Git branches remain safe.
LifeFlow HQ should feel like a small, lovable startup office—but function like a serious business management system.
EXECUTION INSTRUCTIONS
Do not rebuild LifeFlow.
Do not create an unnecessarily large agent organization.
Do not create separate paid AI workers for every small responsibility.
Preserve my existing four conversations and their project context.
Keep the visuals simple and charming.
Prioritize working conversations, real tasks, approvals, and admin access.
Use the original approved HQ image as visual inspiration, not as a requirement for heavy 3D infrastructure.
Start by inspecting the current project and completing Phase 0.
Then show me:

1. The recommended architecture.
2. How each original conversation will connect.
3. The simple HQ layout.
4. The employee-to-workflow mapping.
5. Expected operating costs and limitations.
6. The exact Phase 1 implementation plan.

Stop for my approval before starting major implementation.
After approval, build a genuinely working Phase 1 and verify it on desktop and mobile.
Make this simple, beautiful, functional, affordable, and easy for one founder to manage.

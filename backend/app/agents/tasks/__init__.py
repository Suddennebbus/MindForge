from app.agents.registry import Workflow, Step, register_workflow
from app.agents.tasks.plan_workflow import (
    step_query_expansion,
    step_web_search,
    step_arxiv_search,
    step_analysis,
    step_plan_draft,
    step_critique,
    step_revision,
    step_reading_selection,
    step_save_plan,
)

register_workflow(Workflow(
    key="plan_creation",
    steps=[
        Step(name="query_expansion", func=step_query_expansion),
        Step(name="web_search", func=step_web_search),
        Step(name="arxiv_search", func=step_arxiv_search),
        Step(name="analysis", func=step_analysis),
        Step(name="plan_draft", func=step_plan_draft),
        Step(name="critique", func=step_critique),
        Step(name="revision", func=step_revision),
        Step(name="reading_selection", func=step_reading_selection),
        Step(name="save_plan", func=step_save_plan),
    ],
))

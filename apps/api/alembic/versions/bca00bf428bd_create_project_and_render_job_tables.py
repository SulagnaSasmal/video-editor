"""create project and render_job tables

Revision ID: bca00bf428bd
Revises: 
Create Date: 2026-07-09 11:35:34.942722

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'bca00bf428bd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "project",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("timeline", postgresql.JSONB(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "render_job",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project.id"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="export"),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("output_file", sa.String(), nullable=True),
        sa.Column("download_url", sa.String(), nullable=True),
        sa.Column("voiceover_file", sa.String(), nullable=True),
        sa.Column("command_preview", postgresql.JSONB(none_as_null=True), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_render_job_project_id", "render_job", ["project_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_render_job_project_id", table_name="render_job")
    op.drop_table("render_job")
    op.drop_table("project")

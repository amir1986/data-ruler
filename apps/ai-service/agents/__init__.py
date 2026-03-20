"""Agent registry for the Data Ruler AI service."""

from agents.orchestrator import OrchestratorAgent
from agents.file_detection import FileDetectionAgent
from agents.tabular_processor import TabularProcessorAgent
from agents.document_processor import DocumentProcessorAgent
from agents.database_importer import DatabaseImportAgent
from agents.media_processor import MediaProcessorAgent
from agents.archive_processor import ArchiveProcessorAgent
from agents.structured_data import StructuredDataAgent
from agents.specialized_format import SpecializedFormatAgent
from agents.schema_inference import SchemaInferenceAgent
from agents.relationship_mining import RelationshipMiningAgent
from agents.storage_router import StorageRouterAgent
from agents.analytics import AnalyticsAgent
from agents.visualization import VisualizationAgent
from agents.sql_agent import SQLAgent
from agents.document_qa import DocumentQAAgent
from agents.cross_modal import CrossModalSynthesisAgent
from agents.export_agent import ExportAgent
from agents.validation_security import ValidationSecurityAgent
from agents.scheduler import SchedulerAgent

__all__ = [
    "OrchestratorAgent",
    "FileDetectionAgent",
    "TabularProcessorAgent",
    "DocumentProcessorAgent",
    "DatabaseImportAgent",
    "MediaProcessorAgent",
    "ArchiveProcessorAgent",
    "StructuredDataAgent",
    "SpecializedFormatAgent",
    "SchemaInferenceAgent",
    "RelationshipMiningAgent",
    "StorageRouterAgent",
    "AnalyticsAgent",
    "VisualizationAgent",
    "SQLAgent",
    "DocumentQAAgent",
    "CrossModalSynthesisAgent",
    "ExportAgent",
    "ValidationSecurityAgent",
    "SchedulerAgent",
]

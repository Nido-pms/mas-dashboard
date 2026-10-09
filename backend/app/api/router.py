from fastapi import APIRouter

from app.api.routes import abnormalities, alarms, attendance, employees, health, machine_config, mas, rejection_codes

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(mas.router)
api_router.include_router(abnormalities.router)
api_router.include_router(alarms.router)
api_router.include_router(machine_config.router)
api_router.include_router(employees.router)
api_router.include_router(attendance.router)
api_router.include_router(rejection_codes.router)
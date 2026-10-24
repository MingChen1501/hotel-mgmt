// Package service implements the ReportingService read step order
// (LLD section 7, FR-RPT-1..3): validate the date window, then serve
// from the rebuilt read-model projections. The service never reads
// other modules' stores; freshness is visible through the as-of
// timestamp on every report.
package service

import (
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
)

// Service serves occupancy, revenue, and daily-sheet reads.
type Service struct {
	store *store.Store
}

// New returns a Service over st.
func New(st *store.Store) *Service {
	return &Service{store: st}
}

// Store exposes the read model for the rebuild job wiring.
func (s *Service) Store() *store.Store {
	return s.store
}

// OccupancyReport validates the window and returns per-night,
// per-type counts with the read-model as-of timestamp.
func (s *Service) OccupancyReport(dateFrom, dateTo string) ([]store.NightRow, time.Time, *store.OpError) {
	return s.store.Occupancy(dateFrom, dateTo)
}

// RevenueSummary validates the window and returns per-date room and
// extra revenue totals with the read-model as-of timestamp.
func (s *Service) RevenueSummary(dateFrom, dateTo string) ([]store.RevenueRow, time.Time, *store.OpError) {
	return s.store.Revenue(dateFrom, dateTo)
}

// DailySheet validates the business date and returns the one-page
// desk view with the read-model as-of timestamp.
func (s *Service) DailySheet(businessDate string) (*store.DailySheet, *store.OpError) {
	return s.store.Sheet(businessDate)
}

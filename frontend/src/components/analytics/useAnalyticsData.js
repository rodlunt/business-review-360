import { useState } from "react";
import { api } from "../../api";

const useAnalyticsData = () => {
  const [data, setData] = useState(null);
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await api.get("/analytics");
      setData(response.data);
    } catch (err) {
      setError("Failed to load analytics data");
      console.error("Analytics error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatrixData = async () => {
    try {
      const response = await api.get("/analytics/priority-matrix");
      setMatrixData(response.data);
    } catch (err) {
      console.error("Priority matrix error:", err);
    }
  };

  const refetch = () => {
    fetchAnalyticsData();
    fetchMatrixData();
  };

  return { data, matrixData, loading, error, fetchAnalyticsData, fetchMatrixData, refetch };
};

export default useAnalyticsData;

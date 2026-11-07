package router

import (
	"encoding/json"
	"errors"
	"khairul169/garage-webui/utils"
	"net/http"
)

type Keys struct{}

func keyID(r *http.Request) (string, error) {
	id := r.URL.Query().Get("id")
	if id == "" {
		return "", errors.New("id is required")
	}

	return id, nil
}

func (k *Keys) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := keyID(r)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	body, err := utils.Garage.Fetch("/v2/DeleteKey", &utils.FetchOptions{
		Method: http.MethodPost,
		Params: map[string]string{"id": id},
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Cache.ClearPrefix("key:")
	writeGarageResponse(w, body)
}

func (k *Keys) Update(w http.ResponseWriter, r *http.Request) {
	id, err := keyID(r)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	var request json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&request); err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	body, err := utils.Garage.Fetch("/v2/UpdateKey", &utils.FetchOptions{
		Method: http.MethodPost,
		Params: map[string]string{"id": id},
		Body:   request,
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Cache.ClearPrefix("key:")
	writeGarageResponse(w, body)
}

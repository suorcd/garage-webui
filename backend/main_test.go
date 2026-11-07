package main

import (
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestNewHTTPServerSetsTimeouts(t *testing.T) {
	server := newHTTPServer(":3909", http.NewServeMux())
	if server.ReadHeaderTimeout <= 0 {
		t.Error("expected a ReadHeaderTimeout")
	}
	if server.IdleTimeout <= 0 {
		t.Error("expected an IdleTimeout")
	}
	if server.WriteTimeout != 0 {
		t.Errorf("expected no WriteTimeout so streaming downloads stay open, got %v", server.WriteTimeout)
	}
}

func TestNewHTTPServerClosesHeaderlessConnection(t *testing.T) {
	oldTimeout := readHeaderTimeout
	readHeaderTimeout = 100 * time.Millisecond
	t.Cleanup(func() { readHeaderTimeout = oldTimeout })

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("cannot listen: %v", err)
	}
	server := newHTTPServer(listener.Addr().String(), http.NewServeMux())
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })

	conn, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatalf("cannot dial: %v", err)
	}
	defer conn.Close()

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("cannot set a read deadline: %v", err)
	}
	buf := make([]byte, 1)
	_, err = conn.Read(buf)
	if err == nil {
		t.Fatal("expected the server to close a connection that sends no headers")
	}
	if err != io.EOF {
		t.Errorf("expected the server to close the connection, got %v", err)
	}
}
